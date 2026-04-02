@echo off
setlocal

set "LIGHT_ROOT=%~dp0.."
for %%I in ("%LIGHT_ROOT%") do set "LIGHT_ROOT=%%~fI"
set "MEETILY_ROOT=%LIGHT_ROOT%\..\meetily"

set "CARGO_HOME=%MEETILY_ROOT%\.cargo"
set "RUSTUP_HOME=%MEETILY_ROOT%\.rustup"
set "ORT_LIB_LOCATION=%MEETILY_ROOT%\.tools\onnxruntime-win-x64-1.22.0\onnxruntime-win-x64-1.22.0"
set "ORT_PREFER_DYNAMIC_LINK=1"
set "ORT_SKIP_DOWNLOAD=1"
set "CARGO_NET_OFFLINE=true"
set "CARGO_TARGET_DIR=%LIGHT_ROOT%\.tmp\target-parakeet-helper"
set "TEMP=%LIGHT_ROOT%\.tmp\cargo-temp"
set "TMP=%LIGHT_ROOT%\.tmp\cargo-temp"

if not exist "%TEMP%" mkdir "%TEMP%"

pushd "%LIGHT_ROOT%\runtime\parakeet-helper-src"
if exist "Cargo.lock" del /f /q "Cargo.lock" >nul 2>nul
call "%CARGO_HOME%\bin\cargo.exe" build --release
if errorlevel 1 (
  popd
  exit /b 1
)
popd

if not exist "%LIGHT_ROOT%\runtime\bin" mkdir "%LIGHT_ROOT%\runtime\bin"
copy /Y "%CARGO_TARGET_DIR%\release\light-parakeet-helper.exe" "%LIGHT_ROOT%\runtime\bin\light-parakeet-helper.exe" >nul
copy /Y "%MEETILY_ROOT%\.tools\onnxruntime-win-x64-1.22.0\onnxruntime-win-x64-1.22.0\lib\onnxruntime.dll" "%LIGHT_ROOT%\runtime\bin\onnxruntime.dll" >nul

echo Built light-parakeet-helper.exe
