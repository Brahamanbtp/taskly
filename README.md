# 🚀 Taskly Enterprise: Kanban Platform

Taskly is a high-performance, enterprise-grade Kanban application designed for real-time collaboration, complex task management, and data-driven insights. Built with a modern full-stack architecture, it combines the responsiveness of a desktop app with the scalability of cloud-native services.

![Taskly Preview](https://via.placeholder.com/1200x600/111111/7c5cff?text=Taskly+Enterprise+Kanban)

## 💎 Premium Features

### 🤝 Real-Time Collaboration
- **Multiplayer State**: Powered by **Socket.io** and **Redis**, see changes from team members instantly with zero refresh.
- **Presence Indicators**: View live cursors and active members currently viewing the same board.
- **Smart Mentions**: Use `@mentions` in comments to trigger real-time notifications for team members.

### 🔐 Enterprise Security & RBAC
- **Role-Based Access Control**: Granular permissions (Owner, Admin, Billing Admin, Member, Viewer).
- **Row-Level Security (RLS)**: Data isolation enforced at the PostgreSQL level using `set_config` and custom RLS policies.
- **JWT Authentication**: Secure stateless auth with support for Google OAuth integration.

### 📊 Advanced Analytics
- **Project Velocity**: Track team performance and task completion rates over time.
- **Cycle Time Analysis**: Measure efficiency from "To Do" to "Done."
- **Status Distribution**: Real-time breakdown of project health via interactive charts.

### 💳 Billing & Quota Management
- **Razorpay Integration**: Seamless subscription management for Pro and Enterprise plans.
- **Usage Limits**: Automated enforcement of task, member, and webhook quotas based on the workspace plan.

### 🔍 Intelligence & Search
- **Full-Text Search**: Instant search across titles and descriptions using PostgreSQL `tsvector`.
- **Semantic Search**: (Optional) AI-powered search using vector embeddings for finding tasks by intent.
- **Dependency Graphs**: Visualize task relationships (blockers) using an interactive DAG (Directed Acyclic Graph).

### ☁️ Enterprise Infrastructure
- **S3 Attachments**: Scalable file storage with presigned URL security.
- **Offline Mode**: Full local persistence using **IndexedDB/LocalStorage** with background synchronization.
- **Audit Logs**: Immutable event history for every task action (SOC2 compliant design).

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18 + Vite
- **State Management**: TanStack Query (React Query)
- **Styling**: Vanilla CSS (Modern CSS Variables & Glassmorphism)
- **Animations**: Framer Motion
- **Graphs/Charts**: Recharts & XYFlow (React Flow)

### Backend
- **Runtime**: Node.js + Express
- **Database**: PostgreSQL (with RLS & Vectors)
- **Real-time**: Socket.io + Redis (Sticky Sessions)
- **Payments**: Razorpay SDK
- **Storage**: AWS SDK v3 (S3)

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL 14+
- Redis (Optional, for multiplayer scaling)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/taskly.git
cd taskly

# Install dependencies
npm run install-all
```

### 3. Environment Setup
Copy `.env.example` to `.env` in the `backend` directory and fill in your credentials:
```bash
# backend/.env
DATABASE_URL=postgresql://user:password@localhost:5432/taskly
JWT_SECRET=your_secret
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

### 4. Database Initialization
```bash
cd backend
npm run db:sync
```

### 5. Start Development
```bash
# From the root directory
npm run dev
```

---

## 📜 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Contributors
Built with ❤️ by the Pranay Sharma.