const core = require("@actions/core");
const github = require("@actions/github");
const path = require("path");
const fs = require("fs").promises;

const createOrUpdateIssueFor = async (octokit, language, missing) => {
  const context = github.context;
  
  const title = `Update ${language} Localization`;

  const issueNeeded = missing.length > 0;

  const body = `The following strings are missing in the ${language} localization as of ${
    context.sha
  }:\n\n\`\`\`\n${missing.join("\n")}\n\`\`\``;

  let updated = false;
  const options = octokit.issues.listForRepo.endpoint.merge({
    ...context.repo,
    state: "open",
    labels: "i18n",
  });
  for await (const { data } of octokit.paginate.iterator(options)) {
    for (const issue of data) {
      if (issue.pull_request === undefined && issue.title === title) {
        if (issueNeeded) {
          await octokit.issues.update({
            ...context.repo,
            issue_number: issue.id,
            body,
          });
        } else {
          await octokit.issues.createComment({
            ...context.repo,
            issue_number: issue.id,
            body: `All strings added as of ${context.sha}.`,
          });
          await octokit.issues.update({
            ...context.repo,
            issue_number: issue.id,
            state: "closed",
          });
        }
        updated = true;
        break;
      }
    }
  }
  if (!updated && issueNeeded) {
    await octokit.issues.create({
      ...context.repo,
      title,
      body,
      labels: ["client", "i18n", "help wanted"],
    });
  }
};

const main = async () => {
  const token = core.getInput("token");
  const workspace = process.env["GITHUB_WORKSPACE"];
  const octokit = new github.GitHub(token);

  const dirPath = workspace + "/client/src/elm/MassiveDecks/Strings/Languages";
  const missingRegex = /^\s*(\w+)\s*->\s*\n\s*\[\s*Missing\s*\]\s*$/gm;
  const nameRegex = /^\s*,\s*name\s*=\s*(\w+)\s*$/gm;

  const englishContents = await fs.readFile(path.join(dirPath, "En.elm"));
  const english = englishContents.toString();

  const dir = await fs.opendir(dirPath);
  for await (let child of dir) {
    if (
      child.isFile() &&
      child.name.endsWith(".elm") &&
      child.name !== "Model.elm"
    ) {
      const missing = [];
      const contents = await fs.readFile(path.join(dirPath, child.name));
      const string = contents.toString();
      const matches = string.matchAll(missingRegex);
      for (const match of matches) {
        missing.push(match[1]);
      }
      const nameId = [...string.matchAll(nameRegex)][0][1];
      const name = [
        ...english.matchAll(
          new RegExp(
            `^\\s*${nameId}\\s*->\\s*\\n\\s*\\[\\s*Text\\s+\\"(.*)\\"\\s*\\]\\s*$`,
            "gm"
          )
        ),
      ][0][1];
      await createOrUpdateIssueFor(octokit, name, missing);
    }
  }
};

main().catch((error) => {
  core.error(error);
  core.error(error.stack)
  core.setFailed(`Exception while executing: ${error.message}`);
});
