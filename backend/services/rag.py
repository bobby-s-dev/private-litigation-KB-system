"""RAG (Retrieval Augmented Generation) service with citation tracking."""
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from openai import OpenAI, AzureOpenAI
import uuid

from services.embedding import EmbeddingService
from services.qdrant_client import QdrantService
from services.indexing import IndexingService
from models import Document
from config import settings


class RAGService:
    """Service for RAG with citation tracking."""
    
    def __init__(self, db: Session):
        self.db = db
        self.embedding_service = EmbeddingService()
        self.qdrant_service = QdrantService()
        self.indexing_service = IndexingService(db)
        
        # Initialize LLM client
        if settings.embedding_provider == "azure":
            self.llm_client = AzureOpenAI(
                api_key=settings.azure_openai_api_key,
                azure_endpoint=settings.azure_openai_endpoint,
                api_version=settings.azure_openai_api_version
            ) if settings.azure_openai_api_key else None
        else:
            self.llm_client = OpenAI(
                api_key=settings.openai_api_key,
                base_url=settings.openai_base_url
            ) if settings.openai_api_key else None
    
    def query(
        self,
        question: str,
        matter_id: Optional[str] = None,
        document_ids: Optional[List[str]] = None,
        top_k: Optional[int] = None,
        score_threshold: Optional[float] = None,
        include_citations: bool = True
    ) -> Dict:
        """
        Perform RAG query with citations.
        
        Args:
            question: User question
            matter_id: Optional matter ID to filter
            document_ids: Optional list of document IDs to search
            top_k: Number of chunks to retrieve (default from config)
            score_threshold: Minimum similarity score (default from config)
            include_citations: Include citations in response
        
        Returns:
            Dict with answer, citations, and metadata
        """
        if not self.llm_client:
            return {
                'success': False,
                'error': 'LLM client not initialized',
                'answer': None,
                'citations': []
            }
        
        top_k = top_k or settings.rag_top_k
        score_threshold = score_threshold or settings.rag_score_threshold
        
        # Generate query embedding
        query_embedding = self.embedding_service.generate_embedding(question)
        if not query_embedding:
            return {
                'success': False,
                'error': 'Failed to generate query embedding',
                'answer': None,
                'citations': []
            }
        
        # Build filter
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        
        filter_conditions = []
        if matter_id:
            filter_conditions.append(
                FieldCondition(key="matter_id", match=MatchValue(value=matter_id))
            )
        if document_ids:
            # Filter by document IDs
            filter_conditions.append(
                FieldCondition(
                    key="document_id",
                    match=MatchValue(value=document_ids[0]) if len(document_ids) == 1
                    else None  # Qdrant doesn't support OR easily, would need different approach
                )
            )
        
        filter_condition = Filter(must=filter_conditions) if filter_conditions else None
        
        # Search Qdrant
        collection_name = self.indexing_service.collection_name
        search_results = self.qdrant_service.search(
            collection_name=collection_name,
            query_vector=query_embedding,
            limit=top_k,
            score_threshold=score_threshold,
            filter_condition=filter_condition
        )
        
        if not search_results:
            return {
                'success': True,
                'answer': 'I could not find any relevant information to answer your question.',
                'citations': [],
                'sources_used': 0,
                'confidence': 0.0
            }
        
        # Prepare context from retrieved chunks
        context_chunks = []
        citations = []
        seen_documents = set()
        
        for i, result in enumerate(search_results):
            payload = result.get('payload', {})
            chunk_text = payload.get('chunk_text', '')
            document_id = payload.get('document_id')
            chunk_index = payload.get('chunk_index', 0)
            score = result.get('score', 0.0)
            
            context_chunks.append({
                'text': chunk_text,
                'document_id': document_id,
                'chunk_index': chunk_index,
                'score': score
            })
            
            # Build citation
            if include_citations and document_id:
                if document_id not in seen_documents:
                    # Get document info
                    doc = self.db.query(Document).filter(Document.id == document_id).first()
                    if doc:
                        citation = {
                            'document_id': document_id,
                            'document_title': doc.title or doc.file_name,
                            'file_name': doc.file_name,
                            'document_type': doc.document_type,
                            'chunks': []
                        }
                        citations.append(citation)
                        seen_documents.add(document_id)
                
                # Add chunk to citation
                for citation in citations:
                    if citation['document_id'] == document_id:
                        citation['chunks'].append({
                            'chunk_index': chunk_index,
                            'score': score,
                            'text_preview': chunk_text[:200] + '...' if len(chunk_text) > 200 else chunk_text
                        })
                        break
        
        # Build context for LLM
        context = self._build_context(context_chunks)
        
        # Generate answer using LLM
        answer = self._generate_answer(question, context)
        
        # Calculate confidence (average of top scores)
        avg_score = sum(r.get('score', 0.0) for r in search_results) / len(search_results) if search_results else 0.0
        
        return {
            'success': True,
            'answer': answer,
            'citations': citations if include_citations else [],
            'sources_used': len(seen_documents),
            'chunks_used': len(context_chunks),
            'confidence': avg_score,
            'query': question
        }
    
    def _build_context(self, chunks: List[Dict]) -> str:
        """Build context string from chunks."""
        context_parts = []
        
        for i, chunk in enumerate(chunks, 1):
            context_parts.append(
                f"[Source {i}]\n{chunk['text']}\n"
            )
        
        return "\n".join(context_parts)
    
    def _generate_answer(self, question: str, context: str) -> str:
        """Generate answer using LLM."""
        # Truncate context if too long
        max_context = settings.rag_max_context_length - len(question) - 500  # Reserve space for prompt
        if len(context) > max_context:
            context = context[:max_context] + "\n[... context truncated ...]"
        
        system_prompt = """You are a helpful assistant that answers questions based on provided context from legal documents.
Always base your answers strictly on the provided context. If the context doesn't contain enough information to answer the question, say so.
Cite specific sources when possible by referring to them as [Source 1], [Source 2], etc."""
        
        user_prompt = f"""Context from documents:
{context}

Question: {question}

Answer the question based on the context above. If the context doesn't contain enough information, say so."""
        
        try:
            response = self.llm_client.chat.completions.create(
                model=settings.rag_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=settings.rag_temperature,
                max_tokens=settings.rag_max_tokens
            )
            
            return response.choices[0].message.content.strip()
        
        except Exception as e:
            return f"Error generating answer: {str(e)}"
    
    def query_with_streaming(
        self,
        question: str,
        matter_id: Optional[str] = None,
        document_ids: Optional[List[str]] = None,
        top_k: Optional[int] = None,
        score_threshold: Optional[float] = None
    ):
        """
        Perform RAG query with streaming response.
        
        Yields:
            Dict chunks with answer text and metadata
        """
        # Similar to query but with streaming
        # Implementation would yield chunks as they're generated
        # For now, return regular query result
        result = self.query(
            question,
            matter_id=matter_id,
            document_ids=document_ids,
            top_k=top_k,
            score_threshold=score_threshold
        )
        yield result

