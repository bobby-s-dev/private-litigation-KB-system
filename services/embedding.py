"""Embedding service for generating vector embeddings."""
from typing import List, Optional, Dict
import openai
from openai import OpenAI, AzureOpenAI
import numpy as np
from config import settings


class EmbeddingService:
    """Service for generating text embeddings."""
    
    def __init__(self):
        self.provider = settings.embedding_provider
        self.model = settings.embedding_model
        self.dimension = settings.embedding_dimension
        
        # Initialize client based on provider
        if self.provider == "openai":
            self.client = OpenAI(
                api_key=settings.openai_api_key,
                base_url=settings.openai_base_url
            ) if settings.openai_api_key else None
        elif self.provider == "azure":
            self.client = AzureOpenAI(
                api_key=settings.azure_openai_api_key,
                azure_endpoint=settings.azure_openai_endpoint,
                api_version=settings.azure_openai_api_version
            ) if settings.azure_openai_api_key and settings.azure_openai_endpoint else None
        else:
            self.client = None
    
    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate embedding for a single text.
        
        Returns:
            List of floats representing the embedding vector, or None if error
        """
        if not self.client:
            raise ValueError(f"Embedding client not initialized for provider: {self.provider}")
        
        try:
            if self.provider in ["openai", "azure"]:
                response = self.client.embeddings.create(
                    model=self.model,
                    input=text
                )
                embedding = response.data[0].embedding
                
                # Update dimension if detected
                if len(embedding) != self.dimension:
                    self.dimension = len(embedding)
                
                return embedding
            else:
                raise ValueError(f"Unsupported embedding provider: {self.provider}")
        
        except Exception as e:
            print(f"Error generating embedding: {str(e)}")
            return None
    
    def generate_embeddings_batch(
        self,
        texts: List[str],
        batch_size: int = 100
    ) -> List[Optional[List[float]]]:
        """
        Generate embeddings for multiple texts in batches.
        
        Args:
            texts: List of texts to embed
            batch_size: Number of texts to process per batch
        
        Returns:
            List of embeddings (None for failed embeddings)
        """
        if not self.client:
            raise ValueError(f"Embedding client not initialized for provider: {self.provider}")
        
        all_embeddings = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            
            try:
                if self.provider in ["openai", "azure"]:
                    response = self.client.embeddings.create(
                        model=self.model,
                        input=batch
                    )
                    batch_embeddings = [item.embedding for item in response.data]
                    all_embeddings.extend(batch_embeddings)
                else:
                    raise ValueError(f"Unsupported embedding provider: {self.provider}")
            
            except Exception as e:
                print(f"Error generating batch embeddings: {str(e)}")
                # Add None for each failed item
                all_embeddings.extend([None] * len(batch))
        
        return all_embeddings
    
    def get_embedding_dimension(self) -> int:
        """Get the dimension of embeddings for the current model."""
        # Try to get from a test embedding
        test_embedding = self.generate_embedding("test")
        if test_embedding:
            return len(test_embedding)
        return self.dimension
    
    def is_available(self) -> bool:
        """Check if embedding service is available."""
        return self.client is not None

