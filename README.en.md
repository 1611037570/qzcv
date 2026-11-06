# Skiff Resume

[Simplified Chinese](README.md) | [English](README.en.md)

[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![Vue](https://img.shields.io/badge/Vue-3.5-42b883) ![Vite](https://img.shields.io/badge/Vite-7.1-646CFF) ![NestJS](https://img.shields.io/badge/NestJS-11-E0234E)

## About

Skiff Resume is a free, open-source online resume builder for writing resumes, improving content, and preparing for a job search. It combines form-based editing, live paginated previews, layout themes, and role-based examples with watermark-free exports.

Start with an example or import an existing resume, use AI to draft content, improve experience descriptions, and assess job fit, then continue with interview practice and application tracking.

Built with Vue 3, TypeScript, Vite, and NestJS, the project uses a pnpm workspace for its frontend, backend, and shared packages. Resume data, the layout engine, and agent capabilities are maintained separately by responsibility.

[Try Skiff Resume online](https://qzcv.net)

## Features

- **Resume editor**: Form-based editing with live paginated previews, section management, drag-and-drop ordering, theme switching, and layout adjustments.
- **Themes and examples**: Choose a layout theme or role-based content example and keep editing it to fit your experience.
- **Import and management**: Import existing resumes, manage multiple versions, organize them with tags, and save or back up data locally.
- **AI resume assistant**: Generate, rewrite, score, optimize, and translate resume content, including through a conversational assistant.
- **Job matching**: Compare resume evidence against job requirements, preview tailored drafts, and save them as separate versions.
- **Interview practice**: Prepare for specific topics, practice with your resume and target role, review sessions, and keep training records.
- **Job-search tools**: Track applications, interviews, and offers, and use job-search guides, resignation decision scoring, offer comparison, and a real hourly wage calculator.
- **Export and backup**: Export to PDF, images, or Markdown, and create complete JSON backups.

## Project Structure

| Directory | Responsibility |
| --- | --- |
| `apps/web` | Web application with the editor, templates, workspace, and job-search tools |
| `apps/server` | Backend for PDF export, usage statistics, AI endpoints, and repository star counts |
| `packages/resume-core` | Shared resume fields, formats, media, redaction, and snapshot handling |
| `packages/resume-agent` | Resume generation, import, optimization, scoring, translation, and editing tools |
| `packages/interview-agent` | Interview preparation, simulation, evaluation, and review |
| `packages/agent` | Shared agent assembly and runtime capabilities |
| `packages/ai` | Model requests, streaming response parsing, and provider adapters |
| `deploy` | Deployment configuration |
| `knowledges` | Development conventions and technical notes |

## Local Development

### Requirements

- Node.js: `^20.19.0` or `>=22.12.0`.
- pnpm: Use version `10.34.5`, as declared by the project.

### Installation and Configuration

```shell
pnpm install

# Create local development configuration files
cp apps/web/.env.example apps/web/.env.development
cp apps/server/.env.example apps/server/.env.development
```

Follow the comments in the templates to configure the site URL, service endpoints, resume database, and models. Store actual values in the corresponding environment files and keep them out of version control.

The backend dependency installation also installs the browser engine required for PDF export. If the resume database is unavailable, the backend skips the statistics module and starts the remaining services.

### Start Development Services

```shell
# Start the frontend and backend together
pnpm dev

# Start only the frontend
pnpm dev:web

# Start only the backend
pnpm dev:server
```

The web root redirects to `/resume`. AI providers and models can be configured in the application's AI settings.

### Build

```shell
# Build the workspace
pnpm build

# Build only the frontend
pnpm build:web

# Build only the backend
pnpm build:server
```

The frontend build prerenders public pages and requires the corresponding browser engine in the build environment. See the [frontend documentation](apps/web/README.md), [backend documentation](apps/server/README.md), and [public page documentation](apps/web/src/views/resume/seo/README.md) for configuration and deployment details.

## License

This project is released under the [MIT License](LICENSE) and may be freely used, modified, and distributed.
