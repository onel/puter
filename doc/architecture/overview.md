---
title: "Architecture Overview"
description: "High-level overview of Puter's architecture and how the main components work together"
---

# Architecture Overview

This document provides a high-level overview of Puter's architecture, explaining how the main components work together to create the internet operating system.

## System Components

Puter consists of several major components that work together:

### 1. Backend (Node.js)

**Location:** `/src/backend`

The backend is the core server that handles authentication, file system operations, API endpoints, and business logic.

**Key Technologies:** Node.js, Express, SQLite/MySQL

**Main Responsibilities:**
- User authentication and session management
- File system operations (read, write, delete, share)
- API endpoints for GUI and external applications
- Database operations
- Service orchestration through the Kernel module system

**Core Architecture:**
- **Kernel System:** Central orchestrator (`src/backend/src/Kernel.js`) that manages services and modules
- **Services:** Self-contained units providing specific functionality (e.g., AuthService, FilesystemService)
- **Modules:** Collections of related services organized by concern (e.g., PuterAI module contains AI-related services)
- **Routers:** Express route handlers organized by feature

### 2. GUI (Web Frontend)

**Location:** `/src/gui`

The visual interface users interact with, resembling a desktop operating system.

**Key Technologies:** JavaScript, jQuery, HTML5, CSS3

**Main Responsibilities:**
- Desktop environment rendering
- Window management
- File browser interface
- App launcher and taskbar
- User settings and preferences
- IPC communication with apps

### 3. Terminal

**Location:** `/src/terminal`

Web-based terminal emulator for command-line access.

**Key Technologies:** Xterm.js, WebSocket

**Main Responsibilities:**
- Terminal emulation
- Command execution
- Shell integration

### 4. Phoenix Shell

**Location:** `/src/phoenix`

POSIX-like shell implementation for the terminal.

**Key Technologies:** JavaScript

**Main Responsibilities:**
- Command parsing and execution
- Built-in commands (coreutils)
- Pipeline support
- Environment variable management

### 5. Puter.js SDK

**Location:** `/src/puter-js`

JavaScript SDK for building applications on Puter.

**Key Technologies:** JavaScript

**Main Responsibilities:**
- API client for Puter services
- File system operations
- Authentication helpers
- UI components

## Architecture Patterns

### Backend Architecture

The backend follows a **modular service-oriented architecture**:

#### Kernel System

The Kernel (`src/backend/src/Kernel.js`) is the central orchestrator that:
- Manages the lifecycle of modules and services
- Provides dependency injection through a service container
- Handles module installation and initialization
- Supports external modules and extensions
- Manages the runtime environment

#### Service Container

Services are registered in a container and can depend on other services:
- Services extend `BaseService` and implement lifecycle hooks
- Services are initialized in dependency order
- Services communicate through events and direct method calls
- Services can be accessed via `Context.get('services').get('service-name')`

#### Module Organization

**Internal Modules** (`src/backend/src/modules/`):
- Each module has a `<name>Module.js` file
- Modules register one or more services
- Examples: `PuterAIModule`, `PuterFSModule`, `WebModule`

**Core Services** (`src/backend/src/services/`):
- Services not yet organized into distinct modules
- Registered in `CoreModule.js`
- Examples: `AuthService`, `FilesystemService`, `PermissionService`

**External Modules** (`mods/` and `extensions/`):
- Loaded dynamically at runtime
- Can extend functionality without modifying core code
- Support both CommonJS and ES modules

### Communication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         GUI (Browser)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Desktop    │  │   Windows    │  │     Apps     │     │
│  │  Environment │  │  Management  │  │  (iframes)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                           │                                  │
│                           │ IPC (postMessage)                │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Node.js)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    Kernel                             │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐    │  │
│  │  │  Modules   │  │  Services  │  │   Events   │    │  │
│  │  └────────────┘  └────────────┘  └────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐               │
│         ▼                 ▼                 ▼               │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐         │
│  │   Auth   │      │   File   │      │ Database │         │
│  │ Service  │      │  System  │      │          │         │
│  └──────────┘      └──────────┘      └──────────┘         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    Storage    │
                    │  (Disk/S3)    │
                    └───────────────┘
```

### Inter-Process Communication (IPC)

Apps run in sandboxed iframes and communicate with the GUI using the `postMessage` API:

**Message Flow:**
1. App sends message via `postMessage` to parent window
2. GUI's IPC listener (`src/gui/src/IPC.js`) receives and validates message
3. Message is routed to appropriate handler
4. Handler performs action (may call backend API)
5. Response is sent back to app via `postMessage`

**IPC Handler Registration:**
- New handlers registered via `IPCService.register_ipc_handler()`
- Handlers receive message parameters and IPC context
- Context includes caller information (process, app, window)

**Security:**
- All messages validated for required fields
- `appInstanceID` verified against known instances
- Parent window can be disabled during operations
- Apps isolated in iframes with restricted permissions

### Key Design Principles

1. **Service Isolation:** Each service has a specific responsibility and minimal dependencies
2. **Event-Driven:** Services communicate through an event bus for loose coupling
3. **Extensibility:** Plugin system allows adding new functionality without modifying core code
4. **Security:** Multi-layer authentication and permission system
5. **Context-Aware:** Operations carry context (user, actor, permissions) throughout the stack

## Data Flow Examples

### File Upload Flow

1. User selects file in GUI
2. GUI sends multipart/form-data POST to `/upload` endpoint
3. Backend validates user permissions via `AuthService`
4. `FilesystemService` processes the file:
   - Validates file metadata
   - Checks storage quota
   - Determines storage strategy
5. File is stored via configured storage backend (local disk, S3, etc.)
6. Database is updated with file metadata via `EntityStoreService`
7. Response sent back to GUI with file information
8. GUI updates the file browser view
9. WebSocket notification sent to other connected clients

### App Launch Flow

1. User clicks app icon in GUI
2. GUI requests app information from backend (`/open_item` endpoint)
3. Backend validates app permissions via `PermissionService`
4. GUI creates iframe window for the app
5. App loads with Puter.js SDK injected
6. App establishes IPC connection with GUI
7. App sends 'READY' message via IPC
8. Process status updated to `PROCESS_IPC_ATTACHED`
9. App can now communicate with backend through SDK

### Authentication Flow

1. User submits credentials to `/signup` or `/login` endpoint
2. `AuthService` validates credentials:
   - Username/email validation
   - Password hashing with bcrypt
   - Rate limiting checks via `EdgeRateLimitService`
3. Session token created via `TokenService` (JWT)
4. User record created/updated in database
5. Session cookie set in response
6. `EventService` emits 'user.save_account' event
7. Other services react to event (e.g., create default directories)
8. Response includes user data and token

## Storage Architecture

### File System

**Virtual File System:**
- Abstraction layer over physical storage (`FilesystemService`)
- Pluggable storage backends (local disk, S3, etc.)
- Node-based representation (`FSNodeContext`)

**Storage Strategies:**
- Configurable per deployment
- Support for multiple backends simultaneously
- Metadata cached for performance

**Operations:**
- **Low-Level Operations** (`ll_operations/`): Direct filesystem operations delegated to providers
- **High-Level Operations** (`hl_operations/`): User-facing operations with additional logic (deduplication, conflict resolution)

**Metadata:**
- Stored in database for fast queries
- Includes permissions, ownership, sharing info
- Cached in memory for frequently accessed items

**Content:**
- Stored in configured storage backend
- Accessed via signed URLs for security
- Thumbnails generated on-demand

### Database Schema

**Key Tables:**

**`user`:**
- User accounts and authentication
- Fields: `id`, `uuid`, `username`, `email`, `password`, `email_confirmed`
- Audit fields: `signup_ip`, `signup_user_agent`, `last_activity_ts`

**`app`:**
- Installed applications
- Fields: `id`, `uid`, `name`, `title`, `index_url`, `icon`
- Metadata: `approved_for_listing`, `approved_for_opening_items`

**`subdomains`:**
- Custom domains and hosting
- Links to app or directory
- Fields: `subdomain`, `root_dir`, `owner`

**`notification`:**
- User notifications
- Fields: `id`, `user_id`, `title`, `message`, `created_at`

**`sessions`:**
- User sessions
- Fields: `token`, `user_id`, `created_at`, `expires_at`

**Entity Storage:**
- ORM-like system (`EntityStoreService`)
- Supports validation, permissions, and limits
- Composable entity storage layers (e.g., `ValidationES`, `SetOwnerES`)

## Security Model

### Authentication

**Session Management:**
- JWT-based session tokens
- Cookie-based authentication for web GUI
- API token authentication for external apps
- Token refresh mechanism

**Multi-Factor Authentication:**
- OTP support via `OTPService`
- Email verification codes
- Recovery codes

### Authorization

**Permission System:**
- Permission-based access control via `PermissionService`
- User/Group/App permission model
- File-level permissions (read, write, share)
- Permission inheritance

**ACL (Access Control Lists):**
- Fine-grained access control via `ACLService`
- Support for user, group, and app actors
- Permission scanning for complex scenarios

### Isolation

**App Sandboxing:**
- Apps run in sandboxed iframes
- Same-origin policy enforcement
- IPC-based communication only
- No direct DOM access to parent

**Security Measures:**
- API rate limiting via `RateLimitService`
- CSRF protection via `AntiCSRFService`
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- XSS prevention (HTML encoding)

**Abuse Prevention:**
- Edge rate limiting
- Bot detection
- Shadow banning for suspicious activity
- Audit logging via `AuthAuditService`

## Scalability Considerations

### Current Architecture

**Single-Server Deployment:**
- Default for self-hosted instances
- All components on one server
- SQLite for database (can use MySQL/PostgreSQL)

**Horizontal Scaling:**
- Load balancer support
- Stateless API design
- Session storage can be external (Redis)
- File storage can be distributed (S3)

### Performance Optimizations

**Caching:**
- File metadata caching in memory
- User data caching
- Static asset CDN support
- Database query result caching

**Lazy Loading:**
- GUI components loaded on-demand
- File thumbnails generated on-demand
- App resources loaded progressively

**Real-Time Updates:**
- WebSocket for real-time notifications
- Event-driven updates to connected clients
- Efficient change propagation

**Database:**
- Indexed queries for common operations
- Connection pooling
- Read replicas support (MySQL/PostgreSQL)

### Monitoring

**Performance Monitoring:**
- Request timing via `RequestMeasureService`
- Operation tracing via `OperationTraceService`
- Performance metrics collection

**Health Checks:**
- System validation via `SystemValidationService`
- Service health monitoring
- Graceful degradation

## Development Workflow

For detailed information on setting up a development environment, running tests, and debugging, see:
- [Development Workflow](../contributors/development-workflow.md)
- [Coding Style](../contributors/coding-style.md)
- [Backend Structure](../../src/backend/doc/contributors/structure.md)

## Deployment

For installation methods, configuration options, and production considerations, see:
- [Self-Hosting Instructions](../self-hosters/instructions.md)
- [Configuration Values](../self-hosters/config_values.md)
- [Docker Deployment](../self-hosters/instructions.md#docker)

## Related Documentation

- [Backend Structure](../../src/backend/doc/contributors/structure.md) - Detailed backend directory structure
- [Kernel Documentation](../../src/backend/doc/Kernel.md) - Deep dive into the Kernel system
- [Service Development](../../src/backend/doc/services/README.md) - How to create services
- [Extension Development](../contributors/extensions/README.md) - Building extensions
- [API Documentation](../api/README.md) - REST API reference
- [Filesystem Documentation](../../src/backend/doc/modules/filesystem/API_SPEC.md) - Filesystem API specification