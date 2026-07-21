@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ---- se o repositório estiver configurado, busca primeiro o que a nuvem já processou
if exist ".git" (
  echo Buscando atualizacoes da nuvem...
  git pull --rebase origin main >nul 2>&1
)

echo Processando lancamentos (Forms, WhatsApp, ON SAFETY)...
node nc-mina.js
if errorlevel 1 (
  echo.
  echo ERRO ao processar. Veja a mensagem acima.
  pause
  exit /b 1
)

rem ---- publica o dashboard no GitHub Pages
if exist ".git" (
  echo.
  echo Publicando dashboard online...
  copy /Y dashboard.html index.html >nul
  git add -A >nul 2>&1
  git commit -m "atualizacao manual do dashboard" >nul 2>&1
  git push origin main >nul 2>&1
  if errorlevel 1 (
    git pull --rebase origin main >nul 2>&1
    git push origin main >nul 2>&1
  )
  if errorlevel 1 (
    echo   AVISO: nao consegui publicar. Verifique a internet e rode de novo.
  ) else (
    echo   Publicado! Link: https://cedu360.github.io/Dashboard-cedro/
  )
)

echo.
echo Abrindo dashboard...
start "" "%~dp0dashboard.html"
pause
