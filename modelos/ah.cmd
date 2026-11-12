@echo off
setlocal
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  >&2 echo Recusado: o Node não foi encontrado.
  >&2 echo Faça: instale o Node 22 ou mais novo e rode tools/ah doctor
  exit /b 2
)
set "PRINCIPAL="
for /f "tokens=1,* delims= " %%a in ('git -C "%~dp0." worktree list --porcelain 2^>nul') do if "%%a"=="worktree" if not defined PRINCIPAL set "PRINCIPAL=%%b"
if not defined PRINCIPAL set "PRINCIPAL=%~dp0.."
if not exist "%PRINCIPAL%\.harness\nucleo\bin\ah.mjs" (
  >&2 echo Recusado: não achei .harness\nucleo em %PRINCIPAL%.
  >&2 echo Faça: rode o init a partir do clone do agent-harness
  exit /b 2
)
node "%PRINCIPAL%\.harness\nucleo\bin\ah.mjs" %*
exit /b %errorlevel%
