import "server-only";

export type InstallBindingStatusKind = "valid" | "moved" | "copied" | "missing" | "not-configured";

export type InstallBindingStatus = {
  checkedAt: string;
  status: InstallBindingStatusKind;
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

export async function getInstallBindingStatus(): Promise<InstallBindingStatus> {
  const checkedAt = process.env.OLOAD_INSTALL_BINDING_CHECKED_AT?.trim() || new Date().toISOString();
  const installRoot = process.env.OLOAD_INSTALL_ROOT?.trim() || null;

  if (!installRoot) {
    return {
      checkedAt,
      status: "not-configured",
      message: "Install binding checks are only available when Oload is started from an installed launcher.",
      canRebind: false,
      canRotateInstallId: false,
      installId: null,
      bindingPath: null,
      machineIdPath: null,
      currentInstallRoot: null,
      recordedInstallRoot: null,
      installedAt: null,
    };
  }

  return {
    checkedAt,
    status: (process.env.OLOAD_INSTALL_BINDING_STATUS?.trim() as InstallBindingStatusKind | undefined) || "missing",
    message: process.env.OLOAD_INSTALL_BINDING_MESSAGE?.trim() || "Install binding status has not been reported yet.",
    canRebind: process.env.OLOAD_INSTALL_BINDING_CAN_REBIND?.trim() === "true",
    canRotateInstallId: process.env.OLOAD_INSTALL_BINDING_CAN_ROTATE_ID?.trim() === "true",
    installId: process.env.OLOAD_INSTALL_ID?.trim() || null,
    bindingPath: process.env.OLOAD_INSTALL_BINDING_PATH?.trim() || null,
    machineIdPath: process.env.OLOAD_MACHINE_ID_PATH?.trim() || null,
    currentInstallRoot: installRoot,
    recordedInstallRoot: process.env.OLOAD_INSTALL_BINDING_RECORDED_ROOT?.trim() || null,
    installedAt: process.env.OLOAD_INSTALL_BINDING_INSTALLED_AT?.trim() || null,
  };
}