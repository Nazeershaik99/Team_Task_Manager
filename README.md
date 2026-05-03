TeamTask
A full-stack team task management app built with FastAPI (backend) and React + TypeScript (frontend).

Features

Authentication — Sign up and log in with JWT-based auth
Projects — Create and delete projects; each creator becomes Admin automatically
Members — Admins can invite teammates by email and remove them from projects
Tasks — Admins can create, update, and delete tasks; members can update status of their assigned tasks
Dashboard — Overview of total tasks, status breakdown, tasks per user, and overdue count
Role-based access — Only Admins can delete projects/tasks or manage members


Tech Stack
LayerTechnologyFrontendReact, TypeScript, ViteBackendFastAPI, Python 3.11+DatabasePostgreSQLAuthJWT (HS256)StylingPlain CSS (custom design system)

Project Structure
FULL STACK/
├── backend/
│   └── security.py              # Password hashing, JWT sign/verify
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts           # API client (createApi) — all HTTP calls
│   │   │   └── date.ts          # Date formatting and overdue helpers
│   │   └── ui/
│   │       ├── app.tsx          # Main React app and all UI components
│   │       └── main.tsx         # React entry point
│   ├── style.css                # Global styles and design tokens
│   ├── index.html               # HTML entry point
│   ├── nixpacks.toml            # Nixpacks deploy config
│   ├── package-lock.json
│   ├── package.json             # Node dependencies and scripts
│   ├── postcss.config.cjs       # PostCSS config
│   ├── tsconfig.json            # TypeScript config
│   └── vite.config.ts           # Vite bundler config
├── scripts/
│   └── smoke_py.py              # Smoke test script
├── .env                         # Environment variables (do not commit)
├── .gitignore
├── README.md
└── requirements.txt             # Python dependencies

Getting Started
Prerequisites

Python 3.11+
Node.js 18+
PostgreSQL 14+


1. Clone the repository
bashgit clone https://github.com/your-username/teamtask.git
cd teamtask

2. Backend setup
bash# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
Create a .env file in the project root:
envDATABASE_URL=postgresql://user:password@localhost:5432/teamtask
JWT_SECRET=your_super_secret_key_here
Run database migrations (create tables):
bashpython -m backend.db migrate
Start the backend server:
bashuvicorn backend.main:app --reload --port 8000

3. Frontend setup
bashcd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
The app will be available at http://localhost:5173. API requests are proxied to http://localhost:8000.

4. Build for production
bashcd frontend
npm run build
Serve the dist/ folder with any static host, and deploy the FastAPI backend with:
bashuvicorn backend.main:app --host 0.0.0.0 --port 8000

API Reference
MethodEndpointAuthDescriptionPOST/api/auth/signup—Register a new userPOST/api/auth/login—Log in, receive JWT tokenGET/api/meRequiredGet current user infoGET/api/projectsRequiredList projects for current userPOST/api/projectsRequiredCreate a new projectDELETE/api/projects/{project_id}AdminDelete a project and all its tasksGET/api/projects/{project_id}/membersRequiredList project membersPOST/api/projects/{project_id}/membersAdminAdd a member by emailDELETE/api/projects/{project_id}/members/{user_id}AdminRemove a memberGET/api/projects/{project_id}/tasksRequiredList tasks (Admin: all, Member: assigned only)POST/api/projects/{project_id}/tasksAdminCreate a new taskPATCH/api/tasks/{task_id}RequiredUpdate a taskDELETE/api/tasks/{task_id}AdminDelete a taskGET/api/dashboardRequiredGet dashboard stats

Environment Variables
VariableDescriptionExampleDATABASE_URLPostgreSQL connection stringpostgresql://user:pw@host/dbJWT_SECRETSecret key for signing JWT tokensa-long-random-string

Contributing

Fork the repository
Create a feature branch — git checkout -b feature/my-feature
Commit your changes — git commit -m "feat: add my feature"
Push to the branch — git push origin feature/my-feature
Open a Pull Request


License
MIT License — feel free to use this project for personal or commercial purposes.