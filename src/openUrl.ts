import * as vscode from "vscode";
import { isHttpUrlString } from "./core/url";

/**
 * The one shared path for opening a URL in the browser. URLs that come
 * from servers or from stored settings are only ever opened when they
 * are http/https — anything else (javascript:, file:, a custom
 * protocol handler) is ignored, so a hostile workflow run title or a
 * hand-edited setting cannot make the board launch arbitrary handlers.
 */
export async function openExternalUrl(url: string | undefined): Promise<void> {
  if (!url || !isHttpUrlString(url)) {
    return;
  }
  await vscode.env.openExternal(vscode.Uri.parse(url));
}
