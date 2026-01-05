# Canonical Version & Advanced Duplicate Detection Implementation

## Overview

Enhanced near-duplicate detection and canonical version selection system with advanced fuzzy matching, similarity scoring, and diff/merge artifacts.

## Key Features

### 1. Advanced Fuzzy Matching

#### Multiple Similarity Algorithms

The system now uses **5 different similarity algorithms** for comprehensive comparison:

1. **SequenceMatcher** - Best for longer texts, detects sequence similarities
2. **Levenshtein Distance** - Best for shorter texts, character-level differences
3. **Jaccard Similarity** - Word-based and n-gram based set comparison
4. **Cosine Similarity** - Vector-based similarity using character n-grams
5. **Length Ratio** - Penalizes documents with very different lengths

#### Weighted Combination

The algorithms are combined with intelligent weighting:
- **Long texts (>1000 chars)**: Favors SequenceMatcher and n-grams
- **Short texts**: Favors Levenshtein and Jaccard
- **Adaptive**: Automatically adjusts based on text characteristics

#### Similarity Breakdown

Each comparison returns detailed breakdown:
```json
{
  "similarity_score": 0.92,
  "similarity_breakdown": {
    "sequence_matcher": 0.89,
    "levenshtein": 0.94,
    "jaccard": 0.91,
    "cosine": 0.88,
    "length_ratio": 0.95
  },
  "metadata_similarity": 0.85
}
```

### 2. Canonical Version Selection

#### Selection Criteria

The canonical (best) version is selected based on three weighted factors:

1. **Quality Score (40% weight)**
   - Processing status (completed > needs_review > processing)
   - Text extraction quality
   - Absence of extraction errors
   - Substantial text content

2. **Recency Score (30% weight)**
   - Most recent ingestion/creation date
   - Exponential decay with age
   - Configurable preference

3. **Completeness Score (30% weight)**
   - File size (prefer larger = more complete)
   - Text length
   - Metadata completeness

#### Selection Rules

- **Prefer Latest**: Most recent version (configurable)
- **Prefer Larger**: Larger file size indicates more complete (configurable)
- **Prefer Processed**: Successfully processed documents (configurable)
- **Weighted Scoring**: Customizable weights for each factor

#### Automatic Canonical Assignment

When duplicates are detected:
1. Group documents by similarity
2. Calculate canonical score for each
3. Select highest scoring document
4. Mark as canonical in metadata
5. Link all group members to canonical

### 3. Diff & Merge Artifacts

#### Diff Generation

Supports multiple diff formats:
- **Unified Diff**: Standard unified diff format
- **Context Diff**: Context-based diff format
- **HTML Diff**: (Future enhancement)

#### Diff Statistics

Comprehensive change tracking:
```json
{
  "lines_added": 45,
  "lines_deleted": 12,
  "lines_modified": 8,
  "lines_unchanged": 1200,
  "total_changes": 65,
  "similarity_ratio": 0.95,
  "change_percentage": 5.2
}
```

#### Merge Strategies

Two merge strategies available:

1. **Canonical Strategy**
   - Uses the selected canonical version
   - Fast and deterministic
   - Best for most use cases

2. **Union Strategy**
   - Merges all unique content blocks
   - Preserves all unique passages
   - Useful for comprehensive views

#### Version Comparison

Complete version chain comparison:
- Compare each version with previous
- Cumulative statistics across all versions
- Track evolution of document over time

## API Endpoints

### Version Management

#### Get Version Chain
```http
GET /api/versions/{document_id}/chain
```
Returns all versions of a document in order.

#### Get Current Version
```http
GET /api/versions/{document_id}/current
```
Returns the current (latest) version.

#### Get Canonical Version
```http
GET /api/versions/{document_id}/canonical
```
Returns the canonical (best) version, which may differ from current.

#### Ensure Canonical
```http
POST /api/versions/{document_id}/ensure-canonical
```
Ensures a canonical version is set for the document's duplicate group.

### Diff & Comparison

#### Get Version Diff
```http
GET /api/versions/{document_id}/diff?compare_with={other_id}
GET /api/versions/{document_id}/diff?version_from=1&version_to=2
```
Compare two document versions with configurable format and context.

#### Get Version Comparison
```http
GET /api/versions/{document_id}/comparison
```
Comprehensive comparison across all versions in a chain.

#### Merge Versions
```http
POST /api/versions/{document_id}/merge?merge_strategy=canonical
```
Generate merged artifact from all versions.

### Duplicate Groups

#### Find Duplicate Groups
```http
GET /api/versions/matter/{matter_id}/duplicate-groups?similarity_threshold=0.95
```
Find all duplicate/near-duplicate groups in a matter.

#### Set Group Canonical
```http
POST /api/versions/duplicate-group/{group_id}/set-canonical?document_id={doc_id}
```
Manually set canonical version for a duplicate group.

## Configuration

### Similarity Thresholds

```python
exact_duplicate_threshold: float = 1.0      # Hash match
near_duplicate_threshold: float = 0.95       # Near-duplicate threshold
fuzzy_match_threshold: float = 0.85         # Fuzzy match threshold
```

### Canonical Selection

```python
canonical_selection_enabled: bool = True
canonical_prefer_latest: bool = True
canonical_prefer_larger: bool = True
canonical_prefer_processed: bool = True
canonical_quality_weight: float = 0.4
canonical_recency_weight: float = 0.3
canonical_completeness_weight: float = 0.3
```

### Diff Settings

```python
diff_context_lines: int = 3
diff_max_changes: int = 1000
enable_merge_artifacts: bool = True
```

## Usage Examples

### Python Client

```python
from services.canonical_selection import CanonicalSelectionService
from services.diff_merge import DiffMergeService
from services.version_management import VersionManagementService

# Find duplicate groups
canonical_service = CanonicalSelectionService(db)
groups = canonical_service.find_duplicate_groups(matter_id)

# Set canonical version
for group in groups:
    canonical = canonical_service.set_canonical_version(group)
    print(f"Canonical: {canonical.file_name}")

# Generate diff
diff_service = DiffMergeService(db)
diff = diff_service.generate_diff(doc1, doc2, diff_format='unified')
print(diff['diff'])

# Merge versions
merge_result = diff_service.generate_merge_artifact(
    documents,
    merge_strategy='union'
)
print(merge_result['merged_text'])
```

### cURL Examples

```bash
# Get version chain
curl http://localhost:8000/api/versions/{doc_id}/chain

# Get diff between versions
curl "http://localhost:8000/api/versions/{doc_id}/diff?version_from=1&version_to=2"

# Find duplicate groups
curl "http://localhost:8000/api/versions/matter/{matter_id}/duplicate-groups"

# Set canonical version
curl -X POST "http://localhost:8000/api/versions/{doc_id}/ensure-canonical"
```

## Algorithm Details

### Jaccard Similarity

Uses word-based or n-gram based sets:
```
J(A, B) = |A ∩ B| / |A ∪ B|
```

### Cosine Similarity

Vector-based using character n-grams:
```
cos(θ) = (A · B) / (||A|| × ||B||)
```

### Combined Score

Weighted combination based on text length:
- Long texts: SequenceMatcher (35%) + Levenshtein (20%) + Jaccard (20%) + Cosine (15%) + Length (10%)
- Short texts: SequenceMatcher (25%) + Levenshtein (30%) + Jaccard (25%) + Cosine (10%) + Length (10%)

## Performance Considerations

1. **Similarity Calculation**: O(n×m) for Levenshtein, optimized for large texts
2. **N-gram Extraction**: O(n) where n is text length
3. **Duplicate Group Finding**: O(n²) comparisons, can be optimized with indexing
4. **Diff Generation**: O(n×m) for SequenceMatcher, limited by `diff_max_changes`

## Future Enhancements

1. **Elasticsearch Integration**: For faster similarity search at scale
2. **Docling Integration**: Better document structure parsing
3. **RAG-Anything Integration**: Multimodal content comparison
4. **Semantic Similarity**: Use embeddings for semantic comparison
5. **Incremental Diff**: Track changes incrementally rather than full comparison
6. **Visual Diff**: HTML/visual diff rendering
7. **Machine Learning**: Learn optimal canonical selection from user behavior

## References

- [RAG-Anything](https://github.com/HKUDS/RAG-Anything) - Multimodal RAG framework
- [Docling](https://github.com/docling-project/docling) - Document parsing library
- [Elasticsearch](https://github.com/elastic/elasticsearch) - Search and analytics engine

