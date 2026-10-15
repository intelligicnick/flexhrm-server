/** Pure helpers for agent workspace authz (unit-tested). */

export function canCompleteTask(taskEmployeeId: string, agentEmployeeId: string): boolean {
  return taskEmployeeId === agentEmployeeId;
}

export function canDeleteSharedFile(fileOwnerEmployeeId: string, agentEmployeeId: string): boolean {
  return fileOwnerEmployeeId === agentEmployeeId;
}

export function canUploadToFolder(folderOwnerEmployeeId: string, agentEmployeeId: string): boolean {
  return folderOwnerEmployeeId === agentEmployeeId;
}

export function canDownloadSharedFile(_fileOwnerEmployeeId: string, _agentEmployeeId: string): boolean {
  return true;
}
