@echo off
rem Launch Loot Council locally. Uses the npm script so the server binds to
rem 127.0.0.1 only and is not reachable from other devices on the network.
cd /d "%~dp0"
start "" http://127.0.0.1:3000
npm run dev
