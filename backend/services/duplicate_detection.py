"""Duplicate detection service for exact and near-duplicate detection."""
from typing import Optional, List, Tuple, Dict, Set
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from difflib import SequenceMatcher
from Levenshtein import ratio as levenshtein_ratio
import re
from collections import Counter
import math

from models import Document
from services.hashing import HashingService
from config import settings


class DuplicateDetectionService:
    """Service for detecting exact and near-duplicate documents."""
    
    def __init__(self, db: Session):
        self.db = db
        self.hashing_service = HashingService()
        self.exact_threshold = settings.exact_duplicate_threshold
        self.near_threshold = settings.near_duplicate_threshold
        self.fuzzy_threshold = settings.fuzzy_match_threshold
    
    def find_exact_duplicate(self, file_hash_sha256: str, matter_id: str) -> Optional[Document]:
        """
        Find exact duplicate by hash.
        
        Returns:
            Existing document if exact duplicate found, None otherwise
        """
        return self.db.query(Document).filter(
            and_(
                Document.file_hash_sha256 == file_hash_sha256,
                Document.matter_id == matter_id,
                Document.is_current_version == True
            )
        ).first()
    
    def find_near_duplicates(
        self, 
        text: str, 
        matter_id: str, 
        exclude_document_id: Optional[str] = None
    ) -> List[Tuple[Document, float]]:
        """
        Find near-duplicate documents by text similarity.
        
        Returns:
            List of tuples (document, similarity_score) sorted by similarity (highest first)
        """
        if not text or len(text.strip()) < 100:  # Skip if text too short
            return []
        
        # Get all documents in the matter with extracted text
        query = self.db.query(Document).filter(
            and_(
                Document.matter_id == matter_id,
                Document.is_current_version == True,
                Document.extracted_text.isnot(None),
                Document.extracted_text != ''
            )
        )
        
        if exclude_document_id:
            query = query.filter(Document.id != exclude_document_id)
        
        candidates = query.all()
        
        similarities = []
        text_length = len(text)
        
        for doc in candidates:
            if not doc.extracted_text:
                continue
            
            # Use multiple similarity metrics
            similarity = self._calculate_similarity(text, doc.extracted_text, text_length, len(doc.extracted_text))
            
            if similarity >= self.near_threshold:
                similarities.append((doc, similarity))
        
        # Sort by similarity (highest first)
        similarities.sort(key=lambda x: x[1], reverse=True)
        
        return similarities
    
    def _calculate_similarity(
        self, 
        text1: str, 
        text2: str, 
        len1: int, 
        len2: int
    ) -> float:
        """
        Calculate similarity between two texts using multiple methods.
        
        Returns:
            Combined similarity score (0-1)
        """
        if not text1 or not text2:
            return 0.0
        
        # Method 1: SequenceMatcher (good for longer texts)
        seq_similarity = SequenceMatcher(None, text1, text2).ratio()
        
        # Method 2: Levenshtein ratio (good for shorter texts)
        lev_similarity = levenshtein_ratio(text1, text2)
        
        # Method 3: Jaccard similarity (word-based)
        jaccard_similarity = self._jaccard_similarity(text1, text2)
        
        # Method 4: Cosine similarity (n-gram based)
        cosine_similarity = self._cosine_similarity(text1, text2)
        
        # Method 5: Length-based similarity (penalize very different lengths)
        length_ratio = min(len1, len2) / max(len1, len2) if max(len1, len2) > 0 else 0
        
        # Combined score (weighted average)
        # Use different weights based on text length
        if max(len1, len2) > 1000:
            # For longer texts, favor sequence matching and n-grams
            combined = (
                0.35 * seq_similarity +
                0.20 * lev_similarity +
                0.20 * jaccard_similarity +
                0.15 * cosine_similarity +
                0.10 * length_ratio
            )
        else:
            # For shorter texts, favor Levenshtein and Jaccard
            combined = (
                0.25 * seq_similarity +
                0.30 * lev_similarity +
                0.25 * jaccard_similarity +
                0.10 * cosine_similarity +
                0.10 * length_ratio
            )
        
        return combined
    
    def _jaccard_similarity(self, text1: str, text2: str, n: int = 1) -> float:
        """
        Calculate Jaccard similarity using n-grams.
        
        Args:
            text1: First text
            text2: Second text
            n: N-gram size (1 for words, 2 for bigrams, etc.)
        
        Returns:
            Jaccard similarity score (0-1)
        """
        if n == 1:
            # Word-based Jaccard
            words1 = set(self._tokenize(text1))
            words2 = set(self._tokenize(text2))
        else:
            # N-gram based Jaccard
            words1 = set(self._get_ngrams(text1, n))
            words2 = set(self._get_ngrams(text2, n))
        
        if not words1 and not words2:
            return 1.0
        if not words1 or not words2:
            return 0.0
        
        intersection = len(words1 & words2)
        union = len(words1 | words2)
        
        return intersection / union if union > 0 else 0.0
    
    def _cosine_similarity(self, text1: str, text2: str, n: int = 3) -> float:
        """
        Calculate cosine similarity using character n-grams.
        
        Args:
            text1: First text
            text2: Second text
            n: N-gram size (default 3 for trigrams)
        
        Returns:
            Cosine similarity score (0-1)
        """
        # Get n-grams
        ngrams1 = self._get_ngrams(text1.lower(), n)
        ngrams2 = self._get_ngrams(text2.lower(), n)
        
        if not ngrams1 and not ngrams2:
            return 1.0
        if not ngrams1 or not ngrams2:
            return 0.0
        
        # Count n-grams
        vec1 = Counter(ngrams1)
        vec2 = Counter(ngrams2)
        
        # Get all unique n-grams
        all_ngrams = set(ngrams1) | set(ngrams2)
        
        # Calculate dot product and magnitudes
        dot_product = sum(vec1.get(ngram, 0) * vec2.get(ngram, 0) for ngram in all_ngrams)
        magnitude1 = math.sqrt(sum(count ** 2 for count in vec1.values()))
        magnitude2 = math.sqrt(sum(count ** 2 for count in vec2.values()))
        
        if magnitude1 == 0 or magnitude2 == 0:
            return 0.0
        
        return dot_product / (magnitude1 * magnitude2)
    
    def _tokenize(self, text: str) -> List[str]:
        """Tokenize text into words."""
        # Remove punctuation and split into words
        words = re.findall(r'\b\w+\b', text.lower())
        return words
    
    def _get_ngrams(self, text: str, n: int) -> Set[str]:
        """
        Extract n-grams from text.
        
        Args:
            text: Input text
            n: N-gram size
        
        Returns:
            Set of n-grams
        """
        if n == 1:
            # Character unigrams
            return set(text)
        else:
            # Character n-grams
            ngrams = set()
            for i in range(len(text) - n + 1):
                ngrams.add(text[i:i+n])
            return ngrams
    
    def compare_documents(self, doc1: Document, doc2: Document) -> dict:
        """
        Compare two documents and return detailed comparison with breakdown.
        
        Returns:
            Dict with comprehensive comparison results
        """
        result = {
            'exact_duplicate': False,
            'near_duplicate': False,
            'fuzzy_match': False,
            'similarity_score': 0.0,
            'hash_match': False,
            'text_similarity': 0.0,
            'length_ratio': 0.0,
            'similarity_breakdown': {},
            'metadata_similarity': 0.0,
        }
        
        # Check hash match
        if doc1.file_hash_sha256 and doc2.file_hash_sha256:
            result['hash_match'] = doc1.file_hash_sha256 == doc2.file_hash_sha256
            result['exact_duplicate'] = result['hash_match']
        
        # Check text similarity
        if doc1.extracted_text and doc2.extracted_text:
            text1 = doc1.extracted_text
            text2 = doc2.extracted_text
            len1 = len(text1)
            len2 = len(text2)
            
            # Calculate individual similarity metrics
            seq_similarity = SequenceMatcher(None, text1, text2).ratio()
            lev_similarity = levenshtein_ratio(text1, text2)
            jaccard_similarity = self._jaccard_similarity(text1, text2)
            cosine_similarity = self._cosine_similarity(text1, text2)
            length_ratio = min(len1, len2) / max(len1, len2) if max(len1, len2) > 0 else 0
            
            # Store breakdown
            result['similarity_breakdown'] = {
                'sequence_matcher': seq_similarity,
                'levenshtein': lev_similarity,
                'jaccard': jaccard_similarity,
                'cosine': cosine_similarity,
                'length_ratio': length_ratio,
            }
            
            # Calculate combined similarity
            result['text_similarity'] = self._calculate_similarity(text1, text2, len1, len2)
            result['length_ratio'] = length_ratio
            result['similarity_score'] = result['text_similarity']
            result['near_duplicate'] = result['similarity_score'] >= self.near_threshold
            result['fuzzy_match'] = result['similarity_score'] >= self.fuzzy_threshold
        
        # Compare metadata
        metadata_sim = self._compare_metadata(doc1, doc2)
        result['metadata_similarity'] = metadata_sim
        
        return result
    
    def _compare_metadata(self, doc1: Document, doc2: Document) -> float:
        """Compare document metadata similarity."""
        similarities = []
        
        # Compare titles
        if doc1.title and doc2.title:
            title_sim = levenshtein_ratio(doc1.title.lower(), doc2.title.lower())
            similarities.append(title_sim)
        
        # Compare authors
        if doc1.author and doc2.author:
            author_sim = 1.0 if doc1.author.lower() == doc2.author.lower() else 0.0
            similarities.append(author_sim)
        
        # Compare file names
        if doc1.file_name and doc2.file_name:
            filename_sim = levenshtein_ratio(doc1.file_name.lower(), doc2.file_name.lower())
            similarities.append(filename_sim)
        
        # Compare document types
        if doc1.document_type and doc2.document_type:
            type_sim = 1.0 if doc1.document_type == doc2.document_type else 0.0
            similarities.append(type_sim)
        
        return sum(similarities) / len(similarities) if similarities else 0.0

