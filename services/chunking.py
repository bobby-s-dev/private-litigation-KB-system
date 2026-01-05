"""Document chunking service with multiple strategies."""
from typing import List, Dict, Optional
import re
from dataclasses import dataclass


@dataclass
class Chunk:
    """Represents a text chunk."""
    text: str
    chunk_index: int
    start_position: int
    end_position: int
    metadata: Dict = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class ChunkingService:
    """Service for chunking documents into smaller pieces for embedding."""
    
    def __init__(
        self,
        strategy: str = "sentence",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        min_chunk_size: int = 100,
        max_chunk_size: int = 2000,
        respect_sentence_boundaries: bool = True,
        respect_paragraph_boundaries: bool = True
    ):
        self.strategy = strategy
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size
        self.max_chunk_size = max_chunk_size
        self.respect_sentence_boundaries = respect_sentence_boundaries
        self.respect_paragraph_boundaries = respect_paragraph_boundaries
    
    def chunk_text(
        self,
        text: str,
        document_id: Optional[str] = None,
        document_metadata: Optional[Dict] = None
    ) -> List[Chunk]:
        """
        Chunk text using the configured strategy.
        
        Args:
            text: Text to chunk
            document_id: Optional document ID for metadata
            document_metadata: Optional document metadata to include in chunks
        
        Returns:
            List of Chunk objects
        """
        if not text or len(text.strip()) == 0:
            return []
        
        if self.strategy == "sentence":
            return self._chunk_by_sentence(text, document_id, document_metadata)
        elif self.strategy == "paragraph":
            return self._chunk_by_paragraph(text, document_id, document_metadata)
        elif self.strategy == "sliding_window":
            return self._chunk_sliding_window(text, document_id, document_metadata)
        elif self.strategy == "semantic":
            return self._chunk_semantic(text, document_id, document_metadata)
        else:
            # Default to sentence-based
            return self._chunk_by_sentence(text, document_id, document_metadata)
    
    def _chunk_by_sentence(
        self,
        text: str,
        document_id: Optional[str] = None,
        document_metadata: Optional[Dict] = None
    ) -> List[Chunk]:
        """Chunk text by sentences, respecting size limits."""
        # Split into sentences (handles common sentence endings)
        sentence_pattern = r'(?<=[.!?])\s+'
        sentences = re.split(sentence_pattern, text)
        
        chunks = []
        current_chunk = []
        current_size = 0
        chunk_index = 0
        start_position = 0
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            
            sentence_size = len(sentence)
            
            # If single sentence exceeds max size, split it
            if sentence_size > self.max_chunk_size:
                # Split long sentence into smaller chunks
                sub_chunks = self._split_long_text(sentence, self.max_chunk_size)
                for sub_chunk in sub_chunks:
                    if current_size + len(sub_chunk) > self.chunk_size and current_chunk:
                        # Save current chunk
                        chunk_text = ' '.join(current_chunk)
                        chunks.append(Chunk(
                            text=chunk_text,
                            chunk_index=chunk_index,
                            start_position=start_position,
                            end_position=start_position + len(chunk_text),
                            metadata=self._build_chunk_metadata(
                                document_id, document_metadata, chunk_index
                            )
                        ))
                        chunk_index += 1
                        start_position += len(chunk_text) + 1
                        current_chunk = []
                        current_size = 0
                    
                    current_chunk.append(sub_chunk)
                    current_size += len(sub_chunk) + 1
            else:
                # Check if adding this sentence would exceed chunk size
                if current_size + sentence_size > self.chunk_size and current_chunk:
                    # Save current chunk
                    chunk_text = ' '.join(current_chunk)
                    chunks.append(Chunk(
                        text=chunk_text,
                        chunk_index=chunk_index,
                        start_position=start_position,
                        end_position=start_position + len(chunk_text),
                        metadata=self._build_chunk_metadata(
                            document_id, document_metadata, chunk_index
                        )
                    ))
                    chunk_index += 1
                    start_position += len(chunk_text) + 1
                    
                    # Handle overlap
                    if self.chunk_overlap > 0 and len(current_chunk) > 1:
                        # Keep last few sentences for overlap
                        overlap_text = ' '.join(current_chunk[-2:])
                        current_chunk = [overlap_text] if len(overlap_text) <= self.chunk_overlap else []
                        current_size = len(overlap_text)
                    else:
                        current_chunk = []
                        current_size = 0
                
                current_chunk.append(sentence)
                current_size += sentence_size + 1
        
        # Add remaining chunk
        if current_chunk:
            chunk_text = ' '.join(current_chunk)
            if len(chunk_text) >= self.min_chunk_size:
                chunks.append(Chunk(
                    text=chunk_text,
                    chunk_index=chunk_index,
                    start_position=start_position,
                    end_position=start_position + len(chunk_text),
                    metadata=self._build_chunk_metadata(
                        document_id, document_metadata, chunk_index
                    )
                ))
        
        return chunks
    
    def _chunk_by_paragraph(
        self,
        text: str,
        document_id: Optional[str] = None,
        document_metadata: Optional[Dict] = None
    ) -> List[Chunk]:
        """Chunk text by paragraphs."""
        # Split by double newlines (paragraphs)
        paragraphs = re.split(r'\n\s*\n', text)
        
        chunks = []
        current_chunk = []
        current_size = 0
        chunk_index = 0
        start_position = 0
        
        for paragraph in paragraphs:
            paragraph = paragraph.strip()
            if not paragraph:
                continue
            
            para_size = len(paragraph)
            
            # If paragraph exceeds max size, split it
            if para_size > self.max_chunk_size:
                sub_chunks = self._split_long_text(paragraph, self.max_chunk_size)
                for sub_chunk in sub_chunks:
                    if current_size + len(sub_chunk) > self.chunk_size and current_chunk:
                        chunk_text = '\n\n'.join(current_chunk)
                        chunks.append(Chunk(
                            text=chunk_text,
                            chunk_index=chunk_index,
                            start_position=start_position,
                            end_position=start_position + len(chunk_text),
                            metadata=self._build_chunk_metadata(
                                document_id, document_metadata, chunk_index
                            )
                        ))
                        chunk_index += 1
                        start_position += len(chunk_text) + 2
                        current_chunk = []
                        current_size = 0
                    
                    current_chunk.append(sub_chunk)
                    current_size += len(sub_chunk) + 2
            else:
                if current_size + para_size > self.chunk_size and current_chunk:
                    chunk_text = '\n\n'.join(current_chunk)
                    chunks.append(Chunk(
                        text=chunk_text,
                        chunk_index=chunk_index,
                        start_position=start_position,
                        end_position=start_position + len(chunk_text),
                        metadata=self._build_chunk_metadata(
                            document_id, document_metadata, chunk_index
                        )
                    ))
                    chunk_index += 1
                    start_position += len(chunk_text) + 2
                    
                    # Handle overlap
                    if self.chunk_overlap > 0 and current_chunk:
                        overlap_text = current_chunk[-1]
                        current_chunk = [overlap_text] if len(overlap_text) <= self.chunk_overlap else []
                        current_size = len(overlap_text)
                    else:
                        current_chunk = []
                        current_size = 0
                
                current_chunk.append(paragraph)
                current_size += para_size + 2
        
        # Add remaining chunk
        if current_chunk:
            chunk_text = '\n\n'.join(current_chunk)
            if len(chunk_text) >= self.min_chunk_size:
                chunks.append(Chunk(
                    text=chunk_text,
                    chunk_index=chunk_index,
                    start_position=start_position,
                    end_position=start_position + len(chunk_text),
                    metadata=self._build_chunk_metadata(
                        document_id, document_metadata, chunk_index
                    )
                ))
        
        return chunks
    
    def _chunk_sliding_window(
        self,
        text: str,
        document_id: Optional[str] = None,
        document_metadata: Optional[Dict] = None
    ) -> List[Chunk]:
        """Chunk text using sliding window approach."""
        chunks = []
        start = 0
        chunk_index = 0
        
        while start < len(text):
            end = min(start + self.chunk_size, len(text))
            chunk_text = text[start:end]
            
            # Try to end at sentence boundary if enabled
            if self.respect_sentence_boundaries and end < len(text):
                # Look for sentence ending within last 200 chars
                lookback = min(200, len(chunk_text))
                for i in range(len(chunk_text) - 1, len(chunk_text) - lookback, -1):
                    if chunk_text[i] in '.!?':
                        chunk_text = chunk_text[:i+1]
                        end = start + i + 1
                        break
            
            if len(chunk_text) >= self.min_chunk_size:
                chunks.append(Chunk(
                    text=chunk_text,
                    chunk_index=chunk_index,
                    start_position=start,
                    end_position=end,
                    metadata=self._build_chunk_metadata(
                        document_id, document_metadata, chunk_index
                    )
                ))
                chunk_index += 1
            
            # Move start with overlap
            start = end - self.chunk_overlap
            if start < 0:
                start = 0
        
        return chunks
    
    def _chunk_semantic(
        self,
        text: str,
        document_id: Optional[str] = None,
        document_metadata: Optional[Dict] = None
    ) -> List[Chunk]:
        """
        Semantic chunking (placeholder - would use embeddings to find semantic boundaries).
        Falls back to sentence-based for now.
        """
        # TODO: Implement semantic chunking using embeddings
        # For now, use sentence-based as fallback
        return self._chunk_by_sentence(text, document_id, document_metadata)
    
    def _split_long_text(self, text: str, max_size: int) -> List[str]:
        """Split text that exceeds max_size into smaller pieces."""
        chunks = []
        start = 0
        
        while start < len(text):
            end = min(start + max_size, len(text))
            chunk = text[start:end]
            
            # Try to break at word boundary
            if end < len(text) and chunk[-1] not in ' \n\t':
                last_space = chunk.rfind(' ')
                if last_space > start + max_size * 0.5:  # Only if reasonable
                    chunk = chunk[:last_space]
                    end = start + last_space
            
            chunks.append(chunk)
            start = end
        
        return chunks
    
    def _build_chunk_metadata(
        self,
        document_id: Optional[str],
        document_metadata: Optional[Dict],
        chunk_index: int
    ) -> Dict:
        """Build metadata for a chunk."""
        metadata = {
            'chunk_index': chunk_index,
            'chunking_strategy': self.strategy,
        }
        
        if document_id:
            metadata['document_id'] = document_id
        
        if document_metadata:
            # Include relevant document metadata
            for key in ['document_type', 'matter_id', 'title', 'file_name']:
                if key in document_metadata:
                    metadata[key] = document_metadata[key]
        
        return metadata

