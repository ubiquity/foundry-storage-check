import Zip from "adm-zip";
import * as fs from "fs";
import { dirname, join, resolve, basename } from "path";
import * as crypto from "crypto";

import artifactClient from "@actions/artifact";
import {
  getInput,
  startGroup,
  endGroup,
  info,
  debug,
  setFailed,
  warning,
  error,
} from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { getDefaultProvider } from "@ethersproject/providers";

import { checkLayouts } from "./check";
import { diffLevels, diffTitles, formatDiff } from "./format";
import { createLayout, parseSource, parseLayout } from "./input";
import { StorageLayoutDiffType } from "./types";

const token = process.env.GITHUB_TOKEN || getInput("token");
const baseBranch = getInput("base");
const headBranch = getInput("head");
const contract = getInput("contract");
const address = getInput("address");
const rpcUrl = getInput("rpcUrl");
const failOnRemoval = getInput("failOnRemoval") === "true";
const workingDirectory = getInput("workingDirectory");
const retryDelay = parseInt(getInput("retryDelay") || "5000");

const contractAbs = join(workingDirectory, contract);
// Fix: Sanitize artifact name to prevent invalid characters and length issues
// We use a hash of the full path to ensure uniqueness and validity
const hash = crypto.createHash("sha256").update(contractAbs).digest("hex").substring(0, 8);
const baseName = basename(contract, ".sol").replace(/[^a-zA-Z0-9-_]/g, "_");
const contractEscaped = `${baseName}-${hash}`;

const getReportPath = (branch: string, baseName: string) =>
  `${branch.replace(/[/\]/g, "-")}.${baseName}.json`;

const baseReport = getReportPath(baseBranch, contractEscaped);
const outReport = getReportPath(headBranch, contractEscaped);

const octokit = getOctokit(token);

const { owner, repo } = context.repo;
const repository = owner + "/" + repo;

const provider = rpcUrl ? getDefaultProvider(rpcUrl) : undefined;

let srcContent: string;
let refCommitHash: string | undefined = undefined;

async function _run() {
  startGroup(`Generate storage layout of contract "${contract}" using foundry forge`);
  info(`Start forge process`);
  const cmpContent = createLayout(contract, workingDirectory);
  info(`Parse generated layout`);
  const cmpLayout = parseLayout(cmpContent);
  endGroup();

  const localReportPath = resolve(outReport);
  fs.writeFileSync(localReportPath, cmpContent);

  startGroup(`Upload new report from "${localReportPath}" as artifact named "${outReport}"`);
  const uploadResponse = await artifactClient.uploadArtifact(
    outReport,
    [localReportPath],
    dirname(localReportPath),
    { compressionLevel: 9 }
  );

  if (uploadResponse.id == null) throw Error("Failed to upload storage layout report.");

  info(`Artifact ${uploadResponse.id} has been successfully uploaded!`);
  endGroup();

  if (context.eventName !== "pull_request") return;

  let artifactId: number | null = null;
  startGroup(
    `Searching artifact "${baseReport}" on repository "${repository}", on branch "${baseBranch}"`
  );
  
  for await (const res of octokit.paginate.iterator(octokit.rest.actions.listArtifactsForRepo, {
    owner,
    repo,
  })) {
    const artifact = res.data.find((artifact) => !artifact.expired && artifact.name === baseReport);
    if (!artifact) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay)); 

      continue;
    }

    artifactId = artifact.id;
    refCommitHash = artifact.workflow_run?.head_sha;
    info(
      `Found artifact named "${baseReport}" with ID "${artifactId}" from commit "${refCommitHash}"`
    );
    break;
  }
  endGroup();

  if (artifactId) {
    startGroup(
      `Downloading artifact "${baseReport}" of repository "${repository}" with ID "${artifactId}"`
    );
    const res = await octokit.rest.actions.downloadArtifact({
      owner,
      repo,
      artifact_id: artifactId,
      archive_format: "zip",
    });

    // @ts-ignore data is unknown
    const zip = new Zip(Buffer.from(res.data));
    for (const entry of zip.getEntries()) {
      info(`Loading storage layout report from "${entry.entryName}"`);
      srcContent = zip.readAsText(entry);
    }
    endGroup();
  } else throw Error(`No workflow run found with an artifact named "${baseReport}"`);

  info(`Mapping reference storage layout report`);
  const srcLayout = parseLayout(srcContent);
  endGroup();

  startGroup("Check storage layout");
  const diffs = await checkLayouts(srcLayout, cmpLayout, {
    address,
    provider,
    checkRemovals: failOnRemoval,
  });

  if (diffs.length > 0) {
    info(`Parse source code`);
    const cmpDef = parseSource(contractAbs);

    const formattedDiffs = diffs.map((diff) => {
      const formattedDiff = formatDiff(cmpDef, diff);

      const title = diffTitles[formattedDiff.type];
      const level = diffLevels[formattedDiff.type] || "error";
      (level === "error" ? error : warning)(formattedDiff.message, {
        title,
        file: cmpDef.path,
        startLine: formattedDiff.loc.start.line,
        endLine: formattedDiff.loc.end.line,
        startColumn: formattedDiff.loc.start.column,
        endColumn: formattedDiff.loc.end.column,
      });

      return formattedDiff;
    });

    if (
      formattedDiffs.filter((diff) => diffLevels[diff.type] === "error").length > 0 ||
      (failOnRemoval &&
        formattedDiffs.filter((diff) => diff.type === StorageLayoutDiffType.VARIABLE_REMOVED)
          .length > 0)
    )
      throw Error("Unsafe storage layout changes detected. Please see above for details.");
  }

  endGroup();
}

async function run() {
  try {
    await _run();
  } catch (error: any) {
    setFailed(error);
    if (error.stack) debug(error.stack);
  } finally {
    process.exit();
  }
}

run();
