#define AppName "Oload"
#define AppVersion "0.1.0"
#define BundleRoot "..\\..\\dist\\installers\\windows"
#define NativeOutput "..\\..\\dist\\native"
#define LegalRoot SourcePath

[Setup]
AppId={{E34B88F5-6396-4AD7-8F7B-DB9A85B44214}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Wolfe Dezines
SetupIconFile={#BundleRoot}\oload.ico
LicenseFile={#LegalRoot}\EULA.txt
InfoBeforeFile={#LegalRoot}\SOURCE-AVAILABLE-NOTICE.txt
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
UninstallDisplayIcon={app}\oload.ico
VersionInfoCompany=Wolfe Dezines
VersionInfoCopyright=Copyright (c) 2026 Wolfe Dezines

[Files]
Source: "{#BundleRoot}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#BundleRoot}\install-oload.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BundleRoot}\start-oload.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BundleRoot}\uninstall-oload.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BundleRoot}\EULA.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BundleRoot}\SOURCE-AVAILABLE-NOTICE.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BundleRoot}\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BundleRoot}\oload.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Oload"; Filename: "{app}\start-oload.cmd"; IconFilename: "{app}\oload.ico"
Name: "{group}\Uninstall Oload"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Oload"; Filename: "{app}\start-oload.cmd"; Tasks: desktopicon; IconFilename: "{app}\oload.ico"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Run]
Filename: "powershell.exe"; Parameters: "-NoLogo -NoProfile -ExecutionPolicy Bypass -File ""{app}\install-oload.ps1"" -InstallRoot ""{app}"" -Port ""{code:GetPort}"" {code:GetBindLanArg} -OllamaBaseUrl ""{code:GetOllamaBaseUrl}"" -NodeMode ""{code:GetNodeMode}"" -OllamaMode ""{code:GetOllamaMode}"" -DefaultLanguage ""{code:GetDefaultLanguage}"" -UpdateManifestUrl ""{code:GetUpdateManifestUrl}"" -UpdateChannel ""{code:GetUpdateChannel}"" -UpdateManifestPublicKey ""{code:GetUpdateManifestPublicKey}"" -AdminPassword ""{code:GetAdminPassword}"" -SessionSecret ""{code:GetSessionSecret}"" {code:GetStartNowArg} -NonInteractive"; Flags: waituntilterminated

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoLogo -NoProfile -ExecutionPolicy Bypass -File ""{app}\uninstall-oload.ps1"" -InstallRoot ""{app}"""; Flags: waituntilterminated; RunOnceId: "OloadScriptUninstall"

[Code]
var
  SplashPage: TWizardPage;
  SplashHeadlineLabel: TNewStaticText;
  SplashBodyLabel: TNewStaticText;
  SplashLegalLabel: TNewStaticText;
  RuntimePage: TInputQueryWizardPage;
  LanguagePage: TWizardPage;
  LanguageLabel: TNewStaticText;
  LanguageCombo: TNewComboBox;
  DependencyPage: TWizardPage;
  DependencyLabel: TNewStaticText;
  NodeModeLabel: TNewStaticText;
  NodeModeCombo: TNewComboBox;
  OllamaModeLabel: TNewStaticText;
  OllamaModeCombo: TNewComboBox;
  OptionsPage: TInputOptionWizardPage;

procedure InitializeWizard;
begin
  SplashPage := CreateCustomPage(wpWelcome,
    'Wolfe Dezines // Oload',
    'A private AI workspace and admin console for local model operations, guided installs, and contained runtimes.');
  SplashHeadlineLabel := TNewStaticText.Create(SplashPage);
  SplashHeadlineLabel.Parent := SplashPage.Surface;
  SplashHeadlineLabel.Caption := 'Oload stages a local control plane for chat, admin workflows, dependency management, and isolated Ollama and Node runtimes when needed.';
  SplashHeadlineLabel.Left := 0;
  SplashHeadlineLabel.Top := ScaleY(8);
  SplashHeadlineLabel.Width := SplashPage.SurfaceWidth;
  SplashHeadlineLabel.WordWrap := True;

  SplashBodyLabel := TNewStaticText.Create(SplashPage);
  SplashBodyLabel.Parent := SplashPage.Surface;
  SplashBodyLabel.Caption := 'Next you will review and accept the Wolfe Dezines End User License Agreement, then see a source-available licensing notice that explains the personal-use-only restrictions for this build.';
  SplashBodyLabel.Left := 0;
  SplashBodyLabel.Top := SplashHeadlineLabel.Top + SplashHeadlineLabel.Height + ScaleY(12);
  SplashBodyLabel.Width := SplashPage.SurfaceWidth;
  SplashBodyLabel.WordWrap := True;

  SplashLegalLabel := TNewStaticText.Create(SplashPage);
  SplashLegalLabel.Parent := SplashPage.Surface;
  SplashLegalLabel.Caption := 'Copyright (c) 2026 Wolfe Dezines. All rights reserved.';
  SplashLegalLabel.Left := 0;
  SplashLegalLabel.Top := SplashBodyLabel.Top + SplashBodyLabel.Height + ScaleY(16);
  SplashLegalLabel.Width := SplashPage.SurfaceWidth;
  SplashLegalLabel.WordWrap := True;

  RuntimePage := CreateInputQueryPage(wpSelectDir,
    'Runtime Settings',
    'Choose how the installed app should start.',
    'These values will be written into the local Oload runtime environment file.');
  RuntimePage.Add('Port:', False);
  RuntimePage.Values[0] := '3000';
  RuntimePage.Add('Ollama base URL:', False);
  RuntimePage.Values[1] := 'http://127.0.0.1:11434';
  RuntimePage.Add('Update manifest URL (optional):', False);
  RuntimePage.Values[2] := '';
  RuntimePage.Add('Update channel:', False);
  RuntimePage.Values[3] := 'stable';
  RuntimePage.Add('Update public key (optional):', False);
  RuntimePage.Values[4] := '';
  RuntimePage.Add('Bootstrap admin password (optional):', False);
  RuntimePage.Values[5] := '';
  RuntimePage.Add('Session secret (blank = auto-generate):', False);
  RuntimePage.Values[6] := '';

  LanguagePage := CreateCustomPage(RuntimePage.ID,
    'Default language',
    'Choose the default interface and transcription language.');
  LanguageLabel := TNewStaticText.Create(LanguagePage);
  LanguageLabel.Parent := LanguagePage.Surface;
  LanguageLabel.Caption := 'Default language:';
  LanguageLabel.Left := 0;
  LanguageLabel.Top := ScaleY(8);
  LanguageCombo := TNewComboBox.Create(LanguagePage);
  LanguageCombo.Parent := LanguagePage.Surface;
  LanguageCombo.Style := csDropDownList;
  LanguageCombo.Left := 0;
  LanguageCombo.Top := LanguageLabel.Top + LanguageLabel.Height + ScaleY(6);
  LanguageCombo.Width := LanguagePage.SurfaceWidth;
  LanguageCombo.Items.Add('Auto');
  LanguageCombo.Items.Add('English (United States)');
  LanguageCombo.Items.Add('Arabic');
  LanguageCombo.Items.Add('Bengali');
  LanguageCombo.Items.Add('Chinese');
  LanguageCombo.Items.Add('English (United Kingdom / England)');
  LanguageCombo.Items.Add('Persian');
  LanguageCombo.Items.Add('French');
  LanguageCombo.Items.Add('Hindi');
  LanguageCombo.Items.Add('Japanese');
  LanguageCombo.Items.Add('Korean');
  LanguageCombo.Items.Add('Portuguese');
  LanguageCombo.Items.Add('Russian');
  LanguageCombo.Items.Add('Spanish');
  LanguageCombo.ItemIndex := 1;

  DependencyPage := CreateCustomPage(LanguagePage.ID,
    'Dependency choices',
    'Choose whether Oload should use existing dependencies or install its own copies where possible.');
  DependencyLabel := TNewStaticText.Create(DependencyPage);
  DependencyLabel.Parent := DependencyPage.Surface;
  DependencyLabel.Caption := 'Oload will verify actual locations during install, warn if a shared Node.js or Ollama version is older than the isolated default, and write uninstall notes for the choices you make here.';
  DependencyLabel.Left := 0;
  DependencyLabel.Top := ScaleY(8);
  DependencyLabel.Width := DependencyPage.SurfaceWidth;
  DependencyLabel.WordWrap := True;

  NodeModeLabel := TNewStaticText.Create(DependencyPage);
  NodeModeLabel.Parent := DependencyPage.Surface;
  NodeModeLabel.Caption := 'Node.js / npm:';
  NodeModeLabel.Left := 0;
  NodeModeLabel.Top := DependencyLabel.Top + DependencyLabel.Height + ScaleY(12);
  NodeModeCombo := TNewComboBox.Create(DependencyPage);
  NodeModeCombo.Parent := DependencyPage.Surface;
  NodeModeCombo.Style := csDropDownList;
  NodeModeCombo.Left := 0;
  NodeModeCombo.Top := NodeModeLabel.Top + NodeModeLabel.Height + ScaleY(6);
  NodeModeCombo.Width := DependencyPage.SurfaceWidth;
  NodeModeCombo.Items.Add('Install isolated Node.js/npm for Oload (default)');
  NodeModeCombo.Items.Add('Use existing Node.js/npm if found');
  NodeModeCombo.ItemIndex := 0;

  OllamaModeLabel := TNewStaticText.Create(DependencyPage);
  OllamaModeLabel.Parent := DependencyPage.Surface;
  OllamaModeLabel.Caption := 'Ollama:';
  OllamaModeLabel.Left := 0;
  OllamaModeLabel.Top := NodeModeCombo.Top + NodeModeCombo.Height + ScaleY(12);
  OllamaModeCombo := TNewComboBox.Create(DependencyPage);
  OllamaModeCombo.Parent := DependencyPage.Surface;
  OllamaModeCombo.Style := csDropDownList;
  OllamaModeCombo.Left := 0;
  OllamaModeCombo.Top := OllamaModeLabel.Top + OllamaModeLabel.Height + ScaleY(6);
  OllamaModeCombo.Width := DependencyPage.SurfaceWidth;
  OllamaModeCombo.Items.Add('Install isolated Ollama for Oload (default)');
  OllamaModeCombo.Items.Add('Use existing Ollama if found');
  OllamaModeCombo.ItemIndex := 0;

  OptionsPage := CreateInputOptionPage(DependencyPage.ID,
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
  Result := RuntimePage.Values[5];
end;

function GetSessionSecret(Param: String): String;
begin
  Result := RuntimePage.Values[6];
end;

function GetUpdateManifestUrl(Param: String): String;
begin
  Result := RuntimePage.Values[2];
end;

function GetUpdateChannel(Param: String): String;
begin
  Result := RuntimePage.Values[3];
end;

function GetUpdateManifestPublicKey(Param: String): String;
begin
  Result := RuntimePage.Values[4];
end;

function GetDefaultLanguage(Param: String): String;
begin
  case LanguageCombo.ItemIndex of
    0: Result := 'auto';
    1: Result := 'united-states';
    2: Result := 'arabic';
    3: Result := 'bengali';
    4: Result := 'chinese';
    5: Result := 'united-kingdom';
    6: Result := 'farsi';
    7: Result := 'french';
    8: Result := 'hindi';
    9: Result := 'japanese';
    10: Result := 'korean';
    11: Result := 'portuguese';
    12: Result := 'russian';
    13: Result := 'spanish';
  else
    Result := 'united-states';
  end;
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

    if Trim(RuntimePage.Values[3]) = '' then begin
      MsgBox('Update channel is required.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function GetNodeMode(Param: String): String;
begin
  if NodeModeCombo.ItemIndex = 1 then
    Result := 'existing-if-found'
  else
    Result := 'bundled';
end;

function GetOllamaMode(Param: String): String;
begin
  if OllamaModeCombo.ItemIndex = 1 then
    Result := 'existing-if-found'
  else
    Result := 'install-or-repair';
end;