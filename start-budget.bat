@echo off
cd /d "d:\Vibe Coding\Loot Council\loot-council"
if exist .next rmdir /s /q .next
start http://localhost:3000
npx next dev --turbopack
