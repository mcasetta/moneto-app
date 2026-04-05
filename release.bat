@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo  Moneto - Crea GitHub Release
echo ============================================================
echo.

REM --- Ensure Git is in PATH (needed by gh CLI) ---
set PATH=%LOCALAPPDATA%\Programs\Git\mingw64\bin;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%

REM --- Check gh CLI ---
where gh >nul 2>&1
if errorlevel 1 (
    echo [ERRORE] GitHub CLI non trovato.
    echo Installalo da: https://cli.github.com
    pause
    exit /b 1
)

REM --- Get version from package.json ---
powershell -NoProfile -Command "(Get-Content '%~dp0package.json' | ConvertFrom-Json).version" > "%TEMP%\moneto_version.txt"
set /p VERSION=<"%TEMP%\moneto_version.txt"
del "%TEMP%\moneto_version.txt" >nul 2>&1
if "%VERSION%"=="" (
    echo [ERRORE] Versione non trovata in package.json.
    pause
    exit /b 1
)

set INSTALLER=%~dp0dist\Moneto-Setup-%VERSION%.exe
set LATEST_YML=%~dp0dist\latest.yml

REM --- Check installer exists ---
if not exist "%INSTALLER%" (
    echo [ERRORE] Installer non trovato: %INSTALLER%
    echo Esegui prima build_installer.bat.
    pause
    exit /b 1
)
if not exist "%LATEST_YML%" (
    echo [ERRORE] latest.yml non trovato in dist\
    echo Esegui prima build_installer.bat.
    pause
    exit /b 1
)

echo Versione:   v%VERSION%
echo Installer:  %INSTALLER%
echo.

REM --- Confirm ---
set /p CONFIRM=Creare release v%VERSION% su GitHub? (S/N):
if /i not "%CONFIRM%"=="S" (
    echo Annullato.
    pause
    exit /b 0
)

REM --- Create GitHub release (draft) ---
echo.
echo Caricamento su GitHub...
gh release create "v%VERSION%" "%INSTALLER%" "%LATEST_YML%" ^
    --repo mcasetta/moneto-app ^
    --title "Moneto v%VERSION%" ^
    --draft ^
    --notes "Release Moneto v%VERSION%"

if errorlevel 1 (
    echo [ERRORE] Creazione release fallita.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Release draft v%VERSION% creata su GitHub.
echo  Vai su GitHub, verifica e pubblica la release.
echo  Una volta pubblicata, gli utenti riceveranno l'aggiornamento.
echo ============================================================
pause
