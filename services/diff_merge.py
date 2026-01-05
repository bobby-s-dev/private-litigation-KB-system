"""Diff and merge service for document version comparison."""
from typing import List, Dict, Optional, Tuple
from difflib import unified_diff, context_diff, SequenceMatcher
from sqlalchemy.orm import Session
import re

from models import Document
from config import settings


class DiffMergeService:
    """Service for generating diffs and merge artifacts between document versions."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def generate_diff(
        self,
        doc1: Document,
        doc2: Document,
        diff_format: str = 'unified',
        context_lines: int = None
    ) -> Dict:
        """
        Generate diff between two document versions.
        
        Args:
            doc1: First document (older version)
            doc2: Second document (newer version)
            diff_format: 'unified', 'context', or 'html'
            context_lines: Number of context lines (default from config)
        
        Returns:
            Dict with diff information
        """
        if not doc1.extracted_text or not doc2.extracted_text:
            return {
                'error': 'Both documents must have extracted text',
                'diff': None,
                'statistics': {}
            }
        
        context_lines = context_lines or settings.diff_context_lines
        
        # Split into lines
        lines1 = doc1.extracted_text.splitlines(keepends=True)
        lines2 = doc2.extracted_text.splitlines(keepends=True)
        
        # Generate diff based on format
        if diff_format == 'unified':
            diff_lines = list(unified_diff(
                lines1, lines2,
                fromfile=doc1.file_name or 'old',
                tofile=doc2.file_name or 'new',
                lineterm='',
                n=context_lines
            ))
        elif diff_format == 'context':
            diff_lines = list(context_diff(
                lines1, lines2,
                fromfile=doc1.file_name or 'old',
                tofile=doc2.file_name or 'new',
                lineterm='',
                n=context_lines
            ))
        else:
            # Default to unified
            diff_lines = list(unified_diff(
                lines1, lines2,
                fromfile=doc1.file_name or 'old',
                tofile=doc2.file_name or 'new',
                lineterm='',
                n=context_lines
            ))
        
        # Calculate statistics
        stats = self._calculate_diff_statistics(lines1, lines2, diff_lines)
        
        # Limit diff size if too large
        if len(diff_lines) > settings.diff_max_changes:
            diff_lines = diff_lines[:settings.diff_max_changes]
            stats['truncated'] = True
            stats['truncated_at'] = settings.diff_max_changes
        
        return {
            'diff': '\n'.join(diff_lines),
            'diff_lines': diff_lines,
            'format': diff_format,
            'statistics': stats,
            'document1_id': str(doc1.id),
            'document2_id': str(doc2.id),
        }
    
    def _calculate_diff_statistics(
        self,
        lines1: List[str],
        lines2: List[str],
        diff_lines: List[str]
    ) -> Dict:
        """Calculate statistics about the diff."""
        # Count additions, deletions, modifications
        additions = sum(1 for line in diff_lines if line.startswith('+') and not line.startswith('+++'))
        deletions = sum(1 for line in diff_lines if line.startswith('-') and not line.startswith('---'))
        
        # Use SequenceMatcher for more accurate change detection
        matcher = SequenceMatcher(None, lines1, lines2)
        opcodes = matcher.get_opcodes()
        
        insertions = sum(size for tag, i1, i2, j1, j2 in opcodes if tag == 'insert')
        deletions_count = sum(size for tag, i1, i2, j1, j2 in opcodes if tag == 'delete')
        replacements = sum(size for tag, i1, i2, j1, j2 in opcodes if tag == 'replace')
        equal = sum(size for tag, i1, i2, j1, j2 in opcodes if tag == 'equal')
        
        total_changes = insertions + deletions_count + replacements
        similarity = matcher.ratio()
        
        return {
            'lines_added': insertions,
            'lines_deleted': deletions_count,
            'lines_modified': replacements,
            'lines_unchanged': equal,
            'total_changes': total_changes,
            'similarity_ratio': similarity,
            'total_lines_old': len(lines1),
            'total_lines_new': len(lines2),
            'change_percentage': (total_changes / len(lines1) * 100) if lines1 else 0,
        }
    
    def generate_merge_artifact(
        self,
        documents: List[Document],
        merge_strategy: str = 'canonical'
    ) -> Dict:
        """
        Generate merge artifact showing differences across multiple document versions.
        
        Args:
            documents: List of documents to merge (should be versions of same document)
            merge_strategy: 'canonical' (use canonical version), 'union' (merge all unique content)
        
        Returns:
            Dict with merge artifact
        """
        if not documents:
            return {'error': 'No documents provided'}
        
        if len(documents) == 1:
            return {
                'merged_text': documents[0].extracted_text or '',
                'strategy': merge_strategy,
                'source_documents': [str(d.id) for d in documents],
                'statistics': {
                    'total_versions': 1,
                    'unique_content_blocks': 1,
                }
            }
        
        if merge_strategy == 'canonical':
            # Use canonical version
            from services.canonical_selection import CanonicalSelectionService
            canonical_service = CanonicalSelectionService(self.db)
            canonical = canonical_service.select_canonical_version(documents)
            return {
                'merged_text': canonical.extracted_text or '',
                'strategy': 'canonical',
                'canonical_document_id': str(canonical.id),
                'source_documents': [str(d.id) for d in documents],
                'statistics': {
                    'total_versions': len(documents),
                    'canonical_version': canonical.version_number,
                }
            }
        
        elif merge_strategy == 'union':
            # Merge all unique content
            return self._merge_union(documents)
        
        else:
            return {'error': f'Unknown merge strategy: {merge_strategy}'}
    
    def _merge_union(self, documents: List[Document]) -> Dict:
        """Merge documents by combining unique content blocks."""
        # Extract text blocks from each document
        all_blocks = []
        seen_blocks = set()
        
        for doc in documents:
            if not doc.extracted_text:
                continue
            
            # Split into paragraphs/sections
            blocks = self._extract_content_blocks(doc.extracted_text)
            
            for block in blocks:
                # Normalize block (remove whitespace, lowercase for comparison)
                normalized = self._normalize_block(block)
                block_hash = hash(normalized)
                
                if block_hash not in seen_blocks:
                    seen_blocks.add(block_hash)
                    all_blocks.append({
                        'content': block,
                        'source_document_id': str(doc.id),
                        'source_version': doc.version_number,
                    })
        
        # Combine blocks
        merged_text = '\n\n'.join(block['content'] for block in all_blocks)
        
        return {
            'merged_text': merged_text,
            'strategy': 'union',
            'source_documents': [str(d.id) for d in documents],
            'content_blocks': all_blocks,
            'statistics': {
                'total_versions': len(documents),
                'unique_content_blocks': len(all_blocks),
                'total_blocks_processed': sum(len(self._extract_content_blocks(d.extracted_text or '')) for d in documents),
            }
        }
    
    def _extract_content_blocks(self, text: str) -> List[str]:
        """Extract content blocks (paragraphs) from text."""
        # Split by double newlines (paragraphs)
        blocks = re.split(r'\n\s*\n', text)
        
        # Filter out empty blocks
        blocks = [block.strip() for block in blocks if block.strip()]
        
        # Also consider single newline splits for shorter texts
        if len(blocks) < 2:
            blocks = text.split('\n')
            blocks = [block.strip() for block in blocks if block.strip()]
        
        return blocks
    
    def _normalize_block(self, block: str) -> str:
        """Normalize block for comparison (remove extra whitespace, lowercase)."""
        # Remove extra whitespace
        normalized = ' '.join(block.split())
        # Lowercase for comparison
        return normalized.lower()
    
    def generate_version_comparison(
        self,
        version_chain: List[Document]
    ) -> Dict:
        """
        Generate comprehensive comparison across a version chain.
        
        Returns:
            Dict with comparison of all versions
        """
        if len(version_chain) < 2:
            return {
                'error': 'Need at least 2 versions to compare',
                'versions': len(version_chain)
            }
        
        comparisons = []
        
        # Compare each version with the previous one
        for i in range(1, len(version_chain)):
            prev_doc = version_chain[i-1]
            curr_doc = version_chain[i]
            
            diff = self.generate_diff(prev_doc, curr_doc)
            
            comparisons.append({
                'from_version': prev_doc.version_number,
                'to_version': curr_doc.version_number,
                'from_document_id': str(prev_doc.id),
                'to_document_id': str(curr_doc.id),
                'diff': diff,
            })
        
        # Calculate cumulative statistics
        total_additions = sum(c['diff']['statistics'].get('lines_added', 0) for c in comparisons)
        total_deletions = sum(c['diff']['statistics'].get('lines_deleted', 0) for c in comparisons)
        
        return {
            'version_chain_length': len(version_chain),
            'comparisons': comparisons,
            'cumulative_statistics': {
                'total_additions': total_additions,
                'total_deletions': total_deletions,
                'total_changes': total_additions + total_deletions,
            },
            'versions': [
                {
                    'version_number': doc.version_number,
                    'document_id': str(doc.id),
                    'is_current': doc.is_current_version,
                    'created_at': doc.created_at.isoformat() if doc.created_at else None,
                }
                for doc in version_chain
            ]
        }

