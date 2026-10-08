// Build-time only (ADR-022, SDD-AICHAT-001 §5.2): the public projection of the content model for the AI assistant.
// scripts/postbuild.mjs moves the file out of dist/ before anything is uploaded; it is never served.
import type { APIRoute } from 'astro';
import { getContent } from '../../lib/content/load';
import { publicProjection } from '../../lib/ai/public-projection';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(publicProjection(getContent())), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
