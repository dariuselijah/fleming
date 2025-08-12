# Unified Artifacts System

The Unified Artifacts System in Fleming AI chatbot combines document artifacts and AI-generated content artifacts in a single interface, similar to the Vercel AI chatbot. Users can upload documents to create artifacts and prompt the AI to generate new content artifacts, creating a comprehensive knowledge management system.

## Features

### Supported File Types
- **PDF Documents** (.pdf) - Full text extraction with page count
- **Word Documents** (.doc, .docx) - Text extraction with word count
- **Excel Spreadsheets** (.xls, .xlsx) - Table data extraction with table count
- **CSV Files** (.csv) - Tabular data extraction
- **JSON Files** (.json) - Structured data extraction
- **Text Files** (.txt, .md) - Direct text extraction
- **Images** (.jpg, .png, .gif, .webp, .svg) - Display only (no text extraction)

### Key Capabilities
- **Automatic Text Extraction**: Server-side processing for security and performance
- **AI-Generated Content**: Users can prompt the AI to create various types of artifacts
- **Collapsible Display**: Expandable content view with metadata
- **Document Metadata**: Page count, word count, table count, and extraction timestamp
- **AI Artifact Types**: Summary, code examples, markdown documents, analysis reports, and key points
- **File Type Detection**: Automatic icon and label assignment
- **Content Preview**: Truncated view with full expansion option
- **Chat Integration**: Seamless integration with existing chat functionality

## How It Works

### 1. Document Artifacts
#### File Upload
Users can upload documents through the existing file upload system in the chat interface. The system validates file types and sizes before processing.

#### Content Extraction
When a document is uploaded, the system:
- Identifies the file type
- Processes the document using appropriate libraries
- Extracts text content and metadata
- Stores the extracted information securely

#### Display in Chat
Document artifacts appear in chat messages as:
- **Collapsed View**: Shows file name, type, and basic metadata
- **Expanded View**: Displays full extracted content with formatting
- **Interactive Elements**: Expand/collapse buttons and content scrolling

### 2. AI-Generated Artifacts
#### Spontaneous Creation
The AI automatically creates artifacts when it detects content that would benefit from being saved, similar to the Vercel AI chatbot:
- **Automatic Detection**: The system analyzes user prompts and AI responses to identify artifact opportunities
- **Content Patterns**: Recognizes requests for essays, code, summaries, analysis, reports, and other structured content
- **Length Assessment**: Creates artifacts for responses that meet minimum content length thresholds
- **Context Awareness**: Understands when content should be preserved for future reference

#### AI Processing
The AI processes the request and:
- Generates appropriate content based on the conversation context
- Automatically detects when to create an artifact
- Creates a structured artifact with title, content, and metadata
- Stores the artifact in the database for future reference
- Displays the artifact inline within the chat message

#### Content Types
- **Summary**: Concise conversation summaries
- **Code**: Programming examples and snippets
- **Markdown**: Formatted documents and reports
- **Analysis**: Detailed topic analysis
- **Text**: Key points and organized information

## Technical Implementation

### Frontend Components
- `DocumentArtifact`: Individual document display component
- `DocumentArtifactsPanel`: Panel for displaying document artifacts
- `AIArtifactsPanel`: Panel for displaying AI-generated artifacts
- `UnifiedArtifactsPanel`: Combined interface with tabs for both artifact types
- `InlineArtifact`: Component for displaying artifacts inline within AI messages
- Integration with existing `MessageUser` component and chat input

### Backend Services
- `DocumentProcessingService`: Core text extraction logic
- `/api/create-document-artifact`: Endpoint for creating document artifacts
- `/api/get-document-artifacts`: Endpoint for retrieving document artifacts
- `/api/create-ai-artifact`: Endpoint for creating AI-generated artifacts
- `/api/get-ai-artifacts`: Endpoint for retrieving AI-generated artifacts
- Enhanced file validation and type support

### Dependencies
- `pdf-parse`: PDF text extraction
- `mammoth`: Word document processing
- `xlsx`: Excel spreadsheet parsing
- Built-in browser APIs for text files

### Database Schema
- `document_artifacts`: Table for storing document artifacts with extracted content
- `ai_artifacts`: Table for storing AI-generated content artifacts
- Both tables include Row Level Security (RLS) for user data isolation
- Foreign key relationships to `chats` and `users` tables

## Usage Examples

### Medical Use Cases
1. **Patient Records**: Upload medical reports and extract key information
2. **Research Papers**: Process academic papers for literature review
3. **Lab Results**: Extract data from test result documents
4. **Treatment Plans**: Process treatment documentation for analysis

### General Use Cases
1. **Document Analysis**: Extract text from contracts, reports, or forms
2. **Data Processing**: Parse spreadsheets and CSV files
3. **Content Review**: Analyze text documents for key points
4. **Information Extraction**: Pull specific data from various file types

### AI Artifact Creation Examples
The AI automatically creates artifacts when users ask for content that would benefit from being saved:

1. **Essay Writing**: "Write an essay about diabetes management" → Automatically creates a text artifact
2. **Code Generation**: "Show me a Python function for data analysis" → Automatically creates a code artifact
3. **Report Creation**: "Create a report on treatment options" → Automatically creates a markdown artifact
4. **Analysis Request**: "Analyze the symptoms we discussed" → Automatically creates an analysis artifact
5. **Summary Request**: "Summarize our conversation" → Automatically creates a summary artifact

The system detects these requests and creates artifacts spontaneously without requiring explicit artifact creation commands.

## Demo Page

A dedicated demo page is available at `/test-document-artifacts` that showcases:
- File upload functionality
- Document processing capabilities
- Content extraction examples
- Unified artifacts interface with tabs
- Feature overview and documentation
- **Note**: AI artifacts are now created spontaneously during conversations rather than through explicit suggestions

## Security Features

- **Server-side Processing**: All document processing happens on the server
- **User Authentication**: Processing requires valid user authentication
- **File Validation**: Strict file type and size validation
- **Secure Storage**: Files are stored securely with signed URLs
- **Access Control**: Users can only access their own documents

## Performance Considerations

- **Lazy Loading**: Content is extracted only when requested
- **Caching**: Extracted content is cached to avoid reprocessing
- **Background Processing**: Large documents are processed asynchronously
- **Size Limits**: File size limits prevent memory issues

## AI Artifact Creation Workflow

### Spontaneous Creation Process
1. **User Request**: User asks the AI to create content (essay, code, summary, etc.)
2. **AI Generation**: AI generates the requested content
3. **Automatic Detection**: System analyzes the user prompt and AI response to identify artifact opportunities
4. **Artifact Creation**: System automatically creates and stores the artifact in the database
5. **Inline Display**: Artifact appears inline within the AI message as a collapsible card
6. **User Interaction**: Users can expand, copy, and manage artifacts through the intuitive UI

### Detection Criteria
The system automatically detects artifact opportunities based on:
- **Content Patterns**: Recognizes requests for essays, code, reports, summaries, etc.
- **Content Length**: Creates artifacts for responses that meet minimum length thresholds
- **Content Quality**: Identifies structured, valuable content worth preserving
- **User Intent**: Understands when users want content to be saved for future reference

### Benefits of Spontaneous Creation
- **Seamless Experience**: No need for explicit artifact creation commands
- **Intelligent Detection**: AI understands context and creates artifacts when appropriate
- **Natural Flow**: Artifacts appear naturally within conversations
- **User Control**: Users can still manage and organize artifacts as needed

### Artifact Storage and Access
Created artifacts are:
- Stored in the `ai_artifacts` database table
- Associated with the current chat and user
- Available for future reference and use
- Displayed inline within AI messages and in the unified artifacts panel

## Future Enhancements

- **OCR Integration**: Text extraction from images and scanned documents
- **Advanced Parsing**: Better table and structure recognition
- **Enhanced Detection**: Improved AI artifact detection algorithms
- **Artifact Sharing**: Share artifacts between users or export functionality
- **Advanced AI Generation**: More sophisticated content generation with multiple formats
- **Multi-language Support**: Processing documents in various languages
- **Real-time Collaboration**: Shared document artifacts in conversations
- **AI-powered Analysis**: Intelligent content summarization and key point extraction

## Configuration

The feature can be configured through:
- File type allowlists in `lib/file-handling.ts`
- Processing options in `lib/document-processing.ts`
- API endpoints in `app/api/process-document/route.ts`

## Troubleshooting

### Common Issues
1. **File Not Supported**: Check if the file type is in the allowed list
2. **Processing Failed**: Verify file integrity and try re-uploading
3. **Content Not Displaying**: Check browser console for errors
4. **Large File Issues**: Ensure file size is within limits

### Debug Information
- Check browser console for client-side errors
- Review server logs for processing errors
- Verify file upload permissions and authentication

## Integration with Existing Features

The Document Artifacts feature integrates seamlessly with:
- **Chat System**: Documents appear as message attachments
- **File Upload**: Uses existing upload infrastructure
- **User Authentication**: Respects user permissions and limits
- **RAG System**: Can be used with existing search and retrieval
- **Project Management**: Documents can be associated with projects

This feature enhances Fleming's capabilities as a medical AI chatbot by providing comprehensive document processing and analysis tools, making it easier for healthcare professionals to work with various types of medical documentation and research materials.
