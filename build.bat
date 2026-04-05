@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo  Moneto - Build Installer
echo ============================================================
echo.

REM --- Paths ---
set SCRIPT_DIR=%~dp0
set BACKEND_DIR=%SCRIPT_DIR%..\home-budget-tracker\backend
set RESOURCES_DIR=%SCRIPT_DIR%resources

REM --- Check JRE is present ---
if not exist "%RESOURCES_DIR%\jre\bin\java.exe" (
    echo [ERRORE] JRE 21 non trovato in resources\jre\
    echo.
    echo Scarica JRE 21 da: https://adoptium.net/temurin/releases/
    echo   - Version: 21, OS: Windows, Arch: x64, Package: JRE, Type: zip
    echo Decomprimi e rinomina la cartella in: %RESOURCES_DIR%\jre\
    echo.
    pause
    exit /b 1
)

REM --- Build Spring Boot JAR ---
echo [1/3] Build Spring Boot JAR...
cd /d "%BACKEND_DIR%"
set MVN="C:\Program Files\JetBrains\IntelliJ IDEA Community Edition 2025.2.6.1\plugins\maven\lib\maven3\bin\mvn.cmd"
call %MVN% clean package -DskipTests -P with-frontend -q
if errorlevel 1 (
    echo [ERRORE] Build Maven fallita.
    pause
    exit /b 1
)
echo       OK

REM --- Copy JAR to resources ---
echo [2/3] Copia JAR in resources\...
set JAR_FOUND=0
for %%f in ("%BACKEND_DIR%\target\contabilita-*.jar") do (
    copy /y "%%f" "%RESOURCES_DIR%\moneto.jar" >nul
    set JAR_FOUND=1
)
if "!JAR_FOUND!"=="0" (
    echo [ERRORE] JAR non trovato in backend\target\
    pause
    exit /b 1
)
echo       OK

REM --- Build Electron installer ---
echo [3/3] Build installer Electron...
cd /d "%SCRIPT_DIR%"
REM Disable code signing (no certificate available - avoids winCodeSign symlink error on Windows)
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run build
if errorlevel 1 (
    echo [ERRORE] Build Electron fallita.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Build completata!
echo  Installer: %SCRIPT_DIR%dist\Moneto-Setup-*.exe
echo ============================================================
pause
