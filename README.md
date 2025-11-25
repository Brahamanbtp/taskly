\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{hyperref}
\usepackage{enumitem}
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{fontawesome5}
\usepackage{booktabs}
\usepackage{multirow}
\usepackage{colortbl}
\usepackage{listings}
\usepackage{inconsolata}

\definecolor{codegreen}{rgb}{0,0.6,0}
\definecolor{codegray}{rgb}{0.5,0.5,0.5}
\definecolor{codepurple}{rgb}{0.58,0,0.82}
\definecolor{backcolour}{rgb}{0.95,0.95,0.92}

\lstdefinestyle{mystyle}{
    backgroundcolor=\color{backcolour},
    commentstyle=\color{codegreen},
    keywordstyle=\color{magenta},
    numberstyle=\tiny\color{codegray},
    stringstyle=\color{codepurple},
    basicstyle=\ttfamily\footnotesize,
    breakatwhitespace=false,
    breaklines=true,
    captionpos=b,
    keepspaces=true,
    numbers=left,
    numbersep=5pt,
    showspaces=false,
    showstringspaces=false,
    showtabs=false,
    tabsize=2
}

\lstset{style=mystyle}

\title{\faThumbtack ~ Taskly — Minimal Full-Stack Tasks App}
\author{}
\date{}

\begin{document}

\maketitle

\section*{Overview}
A clean, simple task manager built with \textbf{React + Express + SQLite + JWT}. Taskly implements signup/login, per-user tasks, status updates, summary counters, server-side caching, and persisted API logs. The goal was to build a clear, small, and understandable full-stack app within a short timebox, following the assignment requirements.

\section*{🚀 How to Run Taskly}

\subsection*{1. Backend}
\begin{lstlisting}[language=bash]
cd backend
cp .env.example .env
# Edit .env and set a strong JWT_SECRET
npm install
npm run dev        # or: node server.js
\end{lstlisting}
\textbf{Backend runs at:} \faArrowRight ~ \href{http://localhost:4000}{http://localhost:4000} (or Codespaces forwarded port)

\subsection*{Environment Variables (backend/.env)}
\begin{tabular}{@{}ll@{}}
    \toprule
    \textbf{Key} & \textbf{Meaning} \\
    \midrule
    JWT\_SECRET & Secret used to sign JWTs \\
    PORT & Default 4000 \\
    HOST & Default 0.0.0.0 (Codespaces/Docker friendly) \\
    DB\_PATH & Path to SQLite DB file \\
    \bottomrule
\end{tabular}

\subsection*{2. Frontend}
\begin{lstlisting}[language=bash]
cd frontend
npm install
npm run dev
\end{lstlisting}
\textbf{Frontend runs at:} \faArrowRight ~ \href{http://localhost:3000}{http://localhost:3000} (or Codespaces preview URL)

If frontend cannot reach backend, set:
\begin{lstlisting}[language=bash]
VITE_API_BASE=<your-codespace-backend-url>/api
\end{lstlisting}
in a \texttt{.env} inside \texttt{frontend/}.

\subsection*{3. Run Entire App via Docker (Recommended for Reviewers)}
\begin{lstlisting}[language=bash]
docker compose up --build
\end{lstlisting}
\textbf{Backend} \faArrowRight ~ \href{http://localhost:4000}{http://localhost:4000} \\
\textbf{Frontend} \faArrowRight ~ \href{http://localhost:3000}{http://localhost:3000}

\section*{📦 What Is Done / Not Done}

\subsection*{✅ Completed}
\begin{itemize}
    \item Email/password signup + login
    \item JWT-based protected routes
    \item Create task
    \item List tasks
    \item Update task status (TODO → IN\_PROGRESS → DONE)
    \item Optional: Edit title, Delete task
    \item Each user only sees their tasks
    \item Summary counters (TODO / IN\_PROGRESS / DONE)
    \item Server-side logging: Method, path, timestamp, user ID, request body
    \item Server-side caching (30 seconds per user)
    \item SQLite-powered backend (easy for reviewers)
    \item Health \& metrics endpoints (\texttt{/healthz}, \texttt{/metrics})
    \item Professional folder structure
    \item \texttt{.env.example} and secure env loading
    \item Dockerfile + docker-compose
    \item GitHub Actions CI: Installs backend, starts server, signup → login → create task smoke test
\end{itemize}

\subsection*{❌ Not Done (Timebox)}
\begin{itemize}
    \item No password reset / email verification
    \item No role-based access for log viewing (demo-only)
    \item No pagination or task search
    \item No offline/local-first mode for frontend
    \item No advanced caching like Redis (only in-memory)
    \item No automated E2E tests for frontend yet
\end{itemize}

\section*{🏗️ Architecture (In My Own Words)}

\subsection*{1. Authentication}
Users sign up or log in using \texttt{/api/signup} or \texttt{/api/login}. On success, the server returns a JWT, which the frontend stores in \texttt{localStorage}. Every API request includes:
\begin{lstlisting}[language=bash]
Authorization: Bearer <token>
\end{lstlisting}
A small \texttt{authMiddleware} verifies the token and attaches \texttt{req.user}.

\subsection*{2. Data Storage}
Taskly uses SQLite for simplicity (file-based, portable).

\begin{tabular}{@{}ll@{}}
    \toprule
    \textbf{Table} & \textbf{Columns} \\
    \midrule
    \texttt{users} & \texttt{id (uuid), email, password\_hash, created\_at} \\
    \texttt{tasks} & \texttt{id, user\_id, title, status (TODO / IN\_PROGRESS / DONE), created\_at, updated\_at} \\
    \texttt{logs} & Stores API logs for task-related actions \\
    \bottomrule
\end{tabular}

\subsection*{3. How Tasks Are Fetched}
When a logged-in user loads their tasks:
\begin{itemize}
    \item Server checks in-memory cache for that user
    \item If found and <30 seconds old → returns cached result
    \item If not → fetches from DB, stores in cache, returns tasks
    \item Cache is invalidated automatically when:
    \begin{itemize}
        \item Task is created
        \item Task is updated
        \item Task is deleted
    \end{itemize}
\end{itemize}

\subsection*{4. Logging}
Every task-related API stores:
\begin{itemize}
    \item method
    \item path
    \item user\_id
    \item body (JSON string)
    \item timestamp
\end{itemize}
Logs go to the \texttt{logs} table, not just console.

\section*{🔍 Short Reflections (Assignment Answers)}

\subsection*{1. Caching — How I implemented the 30-second cache}
In \texttt{backend/server.js}, I use a simple \texttt{Map}:
\begin{lstlisting}[language=javascript]
cache.set(userId, { ts: Date.now(), tasks });
\end{lstlisting}
On every \texttt{GET /api/tasks}, I check if the cached entry is <30s old:
\begin{itemize}
    \item If yes → return cached result
    \item If not → fetch from DB, overwrite cache
\end{itemize}
Cache is cleared for that user whenever tasks change. I also track \texttt{cacheHits} and \texttt{cacheMisses} at \texttt{/metrics}.

\subsection*{2. Security — How I prevent cross-user access}
\begin{itemize}
    \item All protected routes use \texttt{authMiddleware} to decode the JWT
    \item Database queries always use \texttt{WHERE user\_id = ?}
    \item Task updates/delete check task ownership before modifying anything
    \item Token must be included as \texttt{Authorization: Bearer <token>}
\end{itemize}

\subsection*{3. Bug I Faced + How I Solved It}
At first, I forgot to invalidate the cache after updating a task. This made the UI show old data for up to 30 seconds. I debugged it by:
\begin{itemize}
    \item Printing cache state to console
    \item Noticing cache hits even after updates
    \item Adding \texttt{invalidateCache(userId)} in create/update/delete handlers
\end{itemize}

\subsection*{4. If I Had 1 More Hour…}
I would:
\begin{itemize}
    \item Add a tiny admin panel to view logs with filters
    \item Add rate-limiting to prevent brute-force login
    \item Deploy backend to Railway / Neon and frontend to Vercel
    \item Add 1 end-to-end test with Playwright
\end{itemize}

\section*{🎨 Screenshots}
(Add screenshots after running the app)
\begin{itemize}
    \item Login Page
    \item Tasks Dashboard
\end{itemize}

\section*{📁 Project Structure}
\dirtree{%
.1 taskly/.
.2 backend/.
.3 server.js.
.3 data.sqlite.
.3 Dockerfile.
.3 .env.example.
.3 package.json.
.2 frontend/.
.3 src/.
.3 Dockerfile.
.3 package.json.
.2 docker-compose.yml.
.2 README.md.
}

\section*{🧪 API Testing (Quick cURL Examples)}

\subsection*{Signup}
\begin{lstlisting}[language=bash]
curl -X POST http://localhost:4000/api/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@example.com", "password": "abc123"}'
\end{lstlisting}

\subsection*{Login}
\begin{lstlisting}[language=bash]
curl -X POST http://localhost:4000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@example.com", "password": "abc123"}'
\end{lstlisting}

\subsection*{Fetch Tasks}
\begin{lstlisting}[language=bash]
curl -X GET http://localhost:4000/api/tasks \
  -H "Authorization: Bearer <TOKEN>"
\end{lstlisting}

\section*{🎯 Final Notes}
Taskly focuses on clarity, correctness, and completeness, matching all assignment goals:
\begin{itemize}
    \item Clean, readable backend
    \item Minimal but fully working frontend
    \item Server-side cache
    \item Persisted logging
    \item Per-user task security
    \item Small, understandable codebase
\end{itemize}
This is intentionally simple but production-aware.

\end{document}
