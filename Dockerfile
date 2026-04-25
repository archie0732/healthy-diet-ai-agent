FROM n8nio/n8n:latest

USER root
RUN npm install -g @supabase/supabase-js
USER node
