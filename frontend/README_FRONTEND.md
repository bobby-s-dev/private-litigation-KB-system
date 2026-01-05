# Litigation Knowledge System - Frontend

Next.js + TailwindCSS frontend for the Litigation Knowledge System.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
app/
  ├── layout.tsx          # Root layout
  ├── page.tsx            # Home page (redirects to cases)
  ├── globals.css         # Global styles with Tailwind
  └── cases/
      └── [caseId]/
          └── page.tsx    # Case Home page

components/
  ├── Sidebar.tsx         # Left sidebar navigation
  ├── CaseHeader.tsx      # Case header with tabs
  ├── FeatureCards.tsx    # Five feature cards
  ├── RecentlyUploadedSources.tsx  # Sources table
  └── FactsPerEntity.tsx  # Donut chart component
```

## Features

- **Case Home Tab**: Complete dashboard view with:
  - Feature cards for AI-powered actions
  - Case description section
  - Document upload section
  - Resume review section
  - Recently uploaded sources table
  - Recent activity feed
  - Facts per entity chart

## Tech Stack

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type safety
- **TailwindCSS**: Utility-first CSS framework
- **Recharts**: Chart library for data visualization

## Development

The frontend is designed to work with the FastAPI backend. Make sure the backend is running on the configured port (default: 8000).

To connect the frontend to the backend, you'll need to:
1. Configure API endpoints in environment variables
2. Create API client utilities
3. Add data fetching logic to components

