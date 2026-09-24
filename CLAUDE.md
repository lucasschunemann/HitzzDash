@AGENTS.md

## HitzzDash

- Modo gratuito: análise dos Reels, resumo semanal e roteiros são feitos pelo Claude Code com a skill `hitzz` (`.claude/skills/hitzz/SKILL.md`) e o CLI `npm run -s cc -- <comando>`.
- Dashboard pode rodar na Vercel (Turso + Blob, sem worker); o Mac processa a fila com `npm run -s cc -- work`.
- Verificação: `npm test`, `npm run typecheck`, `npm run lint`, `npm run smoke`.
