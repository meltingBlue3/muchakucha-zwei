# Commits, branches, and pull requests

## Branches

- Commits go on a topic branch, and `main` changes only by merging a pull request. Starting on `main`, create the branch before the first commit.
- Name it `<type>/<topic>`: the Conventional Commits type of its main change, then a few lowercase English words joined by hyphens, such as `fix/birthdays-list-frame` or `feat/lunar-birthdays`.
- A branch holds one topic and everything that belongs to it: a fix found while building the feature, a test the change had to repair, a follow-up after review. Add such work to the open branch of its topic; a new branch is for unrelated work.

## Commits

Every commit message follows Conventional Commits, in English:

- Subject: `type(scope): summary`.
  - `type` is one of `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
  - `scope` is the area the change lives in, such as `client`, `api`, `assistant`, `lunar`, `e2e`, or `design`. Leave it out for a change across the repository.
  - `summary` starts lowercase, has no closing period, and describes the behaviour after the change as a user meets it (`keep drafts when a session expires`), not the code that was edited.
- Body: why the change was needed and how it behaves now, then the checks run and what stays unverified.
- Each commit is one coherent step that reads on its own.

## Pull requests

- Base: `main`. The human reviews and merges.
- Title: the same `type(scope): summary` format as a commit, in English. A squash merge turns the title into the commit on `main`. For a branch with several commits, the title names the topic as a whole.
- Body: written in Chinese from [`.github/pull_request_template.md`](../../.github/pull_request_template.md), keeping its three sections. `gh pr create` offers the template only when it prompts for the body, so with `--body` or `--fill`, read the template and write the body from it.
- More commits for the same topic go to the open branch. After pushing them, update the body when the summary or evidence has changed.
