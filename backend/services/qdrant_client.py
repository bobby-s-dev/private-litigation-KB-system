"""Qdrant client service for vector database operations."""
from typing import List, Optional, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition,
    MatchValue, CollectionStatus, UpdateStatus
)
from qdrant_client.http import models
import uuid
from config import settings


class QdrantService:
    """Service for managing Qdrant collections and operations."""
    
    def __init__(self):
        self.client = QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
            timeout=settings.qdrant_timeout
        )
        self.default_collection = "documents"
    
    def ensure_collection(
        self,
        collection_name: str,
        vector_size: int,
        distance: Distance = Distance.COSINE
    ) -> bool:
        """
        Ensure a collection exists, create if it doesn't.
        
        Args:
            collection_name: Name of the collection
            vector_size: Size of vectors
            distance: Distance metric (COSINE, EUCLID, DOT)
        
        Returns:
            True if collection exists or was created
        """
        try:
            # Check if collection exists
            collections = self.client.get_collections()
            collection_names = [col.name for col in collections.collections]
            
            if collection_name in collection_names:
                # Verify vector size matches
                collection_info = self.client.get_collection(collection_name)
                if collection_info.config.params.vectors.size != vector_size:
                    raise ValueError(
                        f"Collection {collection_name} exists with different vector size: "
                        f"{collection_info.config.params.vectors.size} != {vector_size}"
                    )
                return True
            
            # Create collection
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=vector_size,
                    distance=distance
                )
            )
            return True
        
        except Exception as e:
            print(f"Error ensuring collection {collection_name}: {str(e)}")
            return False
    
    def delete_collection(self, collection_name: str) -> bool:
        """Delete a collection."""
        try:
            self.client.delete_collection(collection_name)
            return True
        except Exception as e:
            print(f"Error deleting collection {collection_name}: {str(e)}")
            return False
    
    def upsert_points(
        self,
        collection_name: str,
        points: List[PointStruct]
    ) -> bool:
        """
        Upsert points into a collection.
        
        Args:
            collection_name: Name of the collection
            points: List of PointStruct objects
        
        Returns:
            True if successful
        """
        try:
            operation_info = self.client.upsert(
                collection_name=collection_name,
                points=points
            )
            return operation_info.status == UpdateStatus.COMPLETED
        except Exception as e:
            print(f"Error upserting points: {str(e)}")
            return False
    
    def delete_points(
        self,
        collection_name: str,
        point_ids: List[str]
    ) -> bool:
        """
        Delete points from a collection.
        
        Args:
            collection_name: Name of the collection
            point_ids: List of point IDs to delete
        
        Returns:
            True if successful
        """
        try:
            operation_info = self.client.delete(
                collection_name=collection_name,
                points_selector=models.PointIdsList(
                    points=[uuid.UUID(pid) if isinstance(pid, str) else pid for pid in point_ids]
                )
            )
            return operation_info.status == UpdateStatus.COMPLETED
        except Exception as e:
            print(f"Error deleting points: {str(e)}")
            return False
    
    def delete_points_by_filter(
        self,
        collection_name: str,
        filter_condition: Filter
    ) -> bool:
        """
        Delete points matching a filter condition.
        
        Args:
            collection_name: Name of the collection
            filter_condition: Filter condition
        
        Returns:
            True if successful
        """
        try:
            operation_info = self.client.delete(
                collection_name=collection_name,
                points_selector=models.FilterSelector(filter=filter_condition)
            )
            return operation_info.status == UpdateStatus.COMPLETED
        except Exception as e:
            print(f"Error deleting points by filter: {str(e)}")
            return False
    
    def search(
        self,
        collection_name: str,
        query_vector: List[float],
        limit: int = 10,
        score_threshold: Optional[float] = None,
        filter_condition: Optional[Filter] = None
    ) -> List[Dict]:
        """
        Search for similar vectors.
        
        Args:
            collection_name: Name of the collection
            query_vector: Query vector
            limit: Number of results to return
            score_threshold: Minimum similarity score
            filter_condition: Optional filter
        
        Returns:
            List of search results with scores
        """
        try:
            search_results = self.client.search(
                collection_name=collection_name,
                query_vector=query_vector,
                limit=limit,
                score_threshold=score_threshold,
                query_filter=filter_condition
            )
            
            results = []
            for result in search_results:
                results.append({
                    'id': str(result.id),
                    'score': result.score,
                    'payload': result.payload
                })
            
            return results
        
        except Exception as e:
            print(f"Error searching: {str(e)}")
            return []
    
    def get_collection_info(self, collection_name: str) -> Optional[Dict]:
        """Get information about a collection."""
        try:
            info = self.client.get_collection(collection_name)
            return {
                'name': collection_name,
                'vectors_count': info.points_count,
                'indexed_vectors_count': info.indexed_vectors_count,
                'vector_size': info.config.params.vectors.size,
                'distance': info.config.params.vectors.distance.name,
                'status': info.status.name
            }
        except Exception as e:
            print(f"Error getting collection info: {str(e)}")
            return None
    
    def scroll_points(
        self,
        collection_name: str,
        limit: int = 100,
        filter_condition: Optional[Filter] = None,
        offset: Optional[str] = None
    ) -> tuple[List[Dict], Optional[str]]:
        """
        Scroll through points in a collection.
        
        Returns:
            Tuple of (points, next_offset)
        """
        try:
            result = self.client.scroll(
                collection_name=collection_name,
                limit=limit,
                scroll_filter=filter_condition,
                offset=offset
            )
            
            points = []
            for point in result[0]:
                points.append({
                    'id': str(point.id),
                    'vector': point.vector,
                    'payload': point.payload
                })
            
            return points, result[1]
        
        except Exception as e:
            print(f"Error scrolling points: {str(e)}")
            return [], None
    
    def create_filter_by_document_id(self, document_id: str) -> Filter:
        """Create a filter for points with a specific document_id."""
        return Filter(
            must=[
                FieldCondition(
                    key="document_id",
                    match=MatchValue(value=document_id)
                )
            ]
        )
    
    def create_filter_by_matter_id(self, matter_id: str) -> Filter:
        """Create a filter for points with a specific matter_id."""
        return Filter(
            must=[
                FieldCondition(
                    key="matter_id",
                    match=MatchValue(value=matter_id)
                )
            ]
        )

