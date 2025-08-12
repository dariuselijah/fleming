# Document Artifacts System

This document explains how the Document Artifacts system works in the Fleming AI chatbot, which creates collapsible document pages similar to the [Vercel AI chatbot artifacts](https://github.com/vercel/ai-chatbot/tree/main/artifacts).

## Overview

The Document Artifacts system creates persistent, collapsible document pages that store extracted text content from uploaded files. Unlike the previous implementation that only displayed text inline, this system:

1. **Creates persistent artifacts** stored in the database
2. **Provides collapsible UI** similar to the Vercel AI chatbot
3. **Enables artifact reuse** across chat sessions
4. **Maintains document metadata** and processing history

## Architecture

### Database Schema

The system uses a new `document_artifacts` table:

```sql
CREATE TABLE document_artifacts (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  extracted_content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### API Endpoints

- **`POST /api/create-document-artifact`** - Creates new document artifacts
- **`GET /api/get-document-artifacts`** - Retrieves artifacts for a chat
- **`POST /api/process-document`** - Legacy endpoint (still available)

### Components

- **`DocumentArtifactsPanel`** - Main panel displaying all artifacts for a chat
- **`DocumentArtifact`** - Individual artifact display with collapsible content
- **`DocumentArtifactsList`** - Legacy component (still available)

## How It Works

### 1. File Upload & Processing

When a user uploads a document:

1. File is uploaded to Supabase storage (`chat-attachments` bucket)
2. File metadata is stored in `chat_attachments` table
3. User clicks to extract content from the document

### 2. Artifact Creation

When content extraction is requested:

1. **`DocumentArtifact`** component calls `/api/create-document-artifact`
2. **Server processes the file** using `DocumentProcessingService`
3. **Extracted content and metadata** are stored in `document_artifacts` table
4. **Unique artifact ID** is generated for the document
5. **Artifact is linked** to the specific chat and user

### 3. Artifact Display

The **`DocumentArtifactsPanel`** component:

1. **Fetches artifacts** for the current chat from `/api/get-document-artifacts`
2. **Displays artifacts** as collapsible cards
3. **Shows metadata** (file type, creation date, word count, etc.)
4. **Allows expansion** to view full extracted content
5. **Provides actions** to use artifact in chat or view original file

## Key Features

### Collapsible Interface

- **Compact view**: Shows file name, type, and basic metadata
- **Expandable content**: Click to view full extracted text
- **Persistent state**: Remembers which artifacts are expanded

### Artifact Management

- **Unique identification**: Each artifact has a persistent ID
- **Chat association**: Artifacts are linked to specific chat sessions
- **User isolation**: Users can only see their own artifacts
- **Metadata preservation**: Stores file type, size, processing info

### Integration

- **Chat context**: Artifacts can be referenced in conversations
- **File access**: Direct links to original uploaded files
- **Content reuse**: Extracted text can be used across sessions

## Usage Examples

### Creating Artifacts

```typescript
// In DocumentArtifact component
const handleExtractContent = async () => {
  const response = await fetch("/api/create-document-artifact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileUrl: attachment.url,
      fileName: attachment.name,
      contentType: attachment.contentType,
      userId: "user-123",
      isAuthenticated: true,
      chatId: "chat-456"
    }),
  })
  
  const result = await response.json()
  if (result.success) {
    console.log("Artifact created:", result.artifact.id)
  }
}
```

### Displaying Artifacts

```typescript
// In chat interface
<DocumentArtifactsPanel
  chatId={currentChatId}
  userId={currentUserId}
  isAuthenticated={isAuthenticated}
  onArtifactSelect={(artifact) => {
    // Use artifact in chat context
    console.log("Using artifact:", artifact.extracted_content)
  }}
/>
```

## Database Migration

To set up the system, run the SQL migration:

```bash
# Execute the migration file
psql -d your_database -f create-document-artifacts-table.sql
```

Or manually create the table using the SQL in `create-document-artifacts-table.sql`.

## Security Features

- **Row Level Security (RLS)**: Users can only access their own artifacts
- **Authentication required**: All API endpoints validate user identity
- **Chat isolation**: Artifacts are scoped to specific chat sessions
- **File validation**: Server-side file type and content validation

## Performance Considerations

- **Lazy loading**: Artifacts are fetched only when needed
- **Indexed queries**: Database indexes on chat_id, user_id, and created_at
- **Caching**: Artifacts are cached in component state
- **Efficient storage**: JSONB metadata for flexible document information

## Comparison with Vercel AI Chatbot

| Feature | Vercel AI Chatbot | Fleming AI Chatbot |
|---------|-------------------|-------------------|
| Storage | File system (`artifacts/` folder) | Database (`document_artifacts` table) |
| Persistence | File-based | Database-backed |
| UI | Collapsible pages | Collapsible cards |
| Integration | Chat context | Chat context + RAG system |
| Metadata | Limited | Rich (file type, size, processing info) |
| Scalability | File system dependent | Database scalable |

## Future Enhancements

- **Artifact search**: Full-text search across artifact content
- **Version control**: Track changes to artifacts over time
- **Collaboration**: Share artifacts between users
- **Export options**: Download artifacts in various formats
- **Analytics**: Track artifact usage and processing statistics

## Troubleshooting

### Common Issues

1. **"Module not found: Can't resolve 'fs'"**
   - Ensure `DocumentArtifact` component doesn't import `document-processing` service
   - All document processing should happen server-side

2. **Artifacts not appearing**
   - Check database table exists and has correct schema
   - Verify user authentication and chat ID parameters
   - Check browser console for API errors

3. **Permission denied errors**
   - Ensure RLS policies are correctly configured
   - Verify user is authenticated and has access to chat

### Debug Steps

1. Check browser network tab for API calls
2. Verify database table structure matches schema
3. Test API endpoints directly with Postman/curl
4. Check server logs for processing errors
5. Verify file upload and storage is working

## Conclusion

The Document Artifacts system provides a robust, scalable solution for managing document content in chat applications. By storing artifacts in the database with proper security and UI components, it creates a user experience similar to the Vercel AI chatbot while maintaining the flexibility and scalability of a database-backed system.

This system enables users to:
- Upload and process various document types
- Create persistent, searchable document artifacts
- View and interact with document content in a collapsible interface
- Reference and reuse document content across chat sessions
- Maintain a searchable history of processed documents

The implementation follows best practices for security, performance, and user experience, making it suitable for production use in medical and other professional contexts.
