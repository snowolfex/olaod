#define AppName "Oload"
#define AppVersion "0.1.0"
#define BundleRoot "..\\..\\dist\\installers\\windows"
#define NativeOutput "..\\..\\dist\\native"

[Setup]
AppId={{E34B88F5-6396-4AD7-8F7B-DB9A85B44214}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Oload
DefaultGroupName={#AppName}
OutputDir={#NativeOutput}
OutputBaseFilename=OloadSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\start-oload.cmd

[Files]
Source: "{#BundleRoot}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#BundleRoot}\install-oload.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BundleRoot}\start-oload.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BundleRoot}\README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Oload"; Filename: "{app}\start-oload.cmd"
Name: "{userdesktop}\Oload"; Filename: "{app}\start-oload.cmd"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Run]
Filename: "powershell.exe"; Parameters: "-NoLogo -NoProfile -ExecutionPolicy Bypass -File ""{app}\install-oload.ps1"" -InstallRoot ""{app}"" -Port ""{code:GetPort}"" {code:GetBindLanArg} -OllamaBaseUrl ""{code:GetOllamaBaseUrl}"" -AdminPassword ""{code:GetAdminPassword}"" -SessionSecret ""{code:GetSessionSecret}"" {code:GetStartNowArg} -NonInteractive"; Flags: waituntilterminated

[Code]
var
  RuntimePage: TInputQueryWizardPage;
  OptionsPage: TInputOptionWizardPage;

procedure InitializeWizard;
begin
  RuntimePage := CreateInputQueryPage(wpSelectDir,
    'Runtime Settings',
    'Choose how the installed app should start.',
    'These values will be written into the local Oload runtime environment file.');
  RuntimePage.Add('Port:', False);
  RuntimePage.Values[0] := '3000';
  RuntimePage.Add('Ollama base URL:', False);
  RuntimePage.Values[1] := 'http://127.0.0.1:11434';
  RuntimePage.Add('Bootstrap admin password (optional):', False);
  RuntimePage.Values[2] := '';
  RuntimePage.Add('Session secret (blank = auto-generate):', False);
  RuntimePage.Values[3] := '';

  OptionsPage := CreateInputOptionPage(RuntimePage.ID,
    'Startup Options',
    'Choose network and launch behavior.',
    'These options control whether the app binds to your LAN and whether it starts immediately after installation.',
    False,
    False);
  OptionsPage.Add('Expose Oload on the local network');
  OptionsPage.Values[0] := False;
  OptionsPage.Add('Start Oload after installation');
  OptionsPage.Values[1] := True;
end;

function GetPort(Param: String): String;
begin
  Result := RuntimePage.Values[0];
end;

function GetOllamaBaseUrl(Param: String): String;
begin
  Result := RuntimePage.Values[1];
end;

function GetAdminPassword(Param: String): String;
begin
  Result := RuntimePage.Values[2];
end;

function GetSessionSecret(Param: String): String;
begin
  Result := RuntimePage.Values[3];
end;

function GetBindLanArg(Param: String): String;
begin
  if OptionsPage.Values[0] then
    Result := '-BindLan'
  else
    Result := '';
end;

function GetStartNowArg(Param: String): String;
begin
  if OptionsPage.Values[1] then
    Result := '-StartNow'
  else
    Result := '';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = RuntimePage.ID then begin
    if Trim(RuntimePage.Values[0]) = '' then begin
      MsgBox('Port is required.', mbError, MB_OK);
      Result := False;
    end;

    if Trim(RuntimePage.Values[1]) = '' then begin
      MsgBox('Ollama base URL is required.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;