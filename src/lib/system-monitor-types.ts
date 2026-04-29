export type SystemMonitorSeriesPoint = {
  timestamp: string;
  value: number;
};

export type SystemMonitorMemorySnapshot = {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedHistory: SystemMonitorSeriesPoint[];
  freeHistory: SystemMonitorSeriesPoint[];
};

export type SystemMonitorTrafficSnapshot = {
  currentBytesPerSecond: number;
  history: SystemMonitorSeriesPoint[];
};

export type SystemMonitorModelSnapshot = {
  key: string;
  providerId: string;
  model: string;
  activeMemoryBytes: number | null;
  estimatedFootprintBytes: number | null;
  currentBytesPerSecond: number;
  history: SystemMonitorSeriesPoint[];
  lastSeenAt: string | null;
};

export type InstallBindingMonitorSnapshot = {
  checkedAt: string;
  status: "valid" | "moved" | "copied" | "missing" | "not-configured";
  message: string;
  canRebind: boolean;
  canRotateInstallId: boolean;
  installId: string | null;
  bindingPath: string | null;
  machineIdPath: string | null;
  currentInstallRoot: string | null;
  recordedInstallRoot: string | null;
  installedAt: string | null;
};

export type AdminSystemMonitorSnapshot = {
  capturedAt: string;
  runningModelCount: number;
  installBinding: InstallBindingMonitorSnapshot;
  memory: SystemMonitorMemorySnapshot;
  traffic: SystemMonitorTrafficSnapshot;
  models: SystemMonitorModelSnapshot[];
};