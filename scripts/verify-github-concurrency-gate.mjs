#!/usr/bin/env node

const REQUIRED_CHECKS = [
    'Required application quality',
    'Required multi-process concurrency (MariaDB/InnoDB)',
];
const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const rulesOnly = process.argv.includes('--rules-only');
const repository = (process.env.GITHUB_REPOSITORY || '').trim();
const branch = (process.env.GITHUB_DEFAULT_BRANCH || 'main').trim();
const token = (process.env.GITHUB_TOKEN || '').trim();

function fail(message, exitCode = 1) {
    process.stderr.write(`${message}\n`);
    process.exit(exitCode);
}

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    fail('GITHUB_REPOSITORY must use the owner/repository format.', 64);
}

if (!/^[A-Za-z0-9._/-]{1,255}$/.test(branch) || branch.includes('..')) {
    fail('GITHUB_DEFAULT_BRANCH is invalid.', 64);
}

if (token.length < 20) {
    fail('A short-lived GITHUB_TOKEN with repository metadata access is required.', 64);
}

async function github(path) {
    const response = await fetch(`${API_ORIGIN}${path}`, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': API_VERSION,
            'User-Agent': 'ubsc-production-readiness',
        },
    });

    if (!response.ok) {
        throw new Error(`GitHub API request failed with HTTP ${response.status}.`);
    }

    return response.json();
}

function statusCheckRules(rules) {
    return Array.isArray(rules)
        ? rules.filter((rule) => rule?.type === 'required_status_checks')
        : [];
}

function ruleOfType(rules, type) {
    return Array.isArray(rules)
        ? rules.find((rule) => rule?.type === type)
        : null;
}

function pullRequestRuleIsStrict(rule) {
    const parameters = rule?.parameters;

    return Number.isInteger(parameters?.required_approving_review_count)
        && parameters.required_approving_review_count >= 1
        && parameters.dismiss_stale_reviews_on_push === true
        && parameters.require_code_owner_review === true
        && parameters.require_last_push_approval === true
        && parameters.required_review_thread_resolution === true;
}

function ruleRequirement(rule, context) {
    const parameters = rule?.parameters;
    const checks = Array.isArray(parameters?.required_status_checks)
        ? parameters.required_status_checks
        : [];
    const required = checks.find((check) => check?.context === context);

    return parameters?.strict_required_status_checks_policy === true
        && Number.isInteger(required?.integration_id)
        && required.integration_id > 0
        ? required
        : null;
}

try {
    const encodedRepository = repository
        .split('/')
        .map(encodeURIComponent)
        .join('/');
    const encodedBranch = encodeURIComponent(branch);
    const [branchState, activeRules] = await Promise.all([
        github(`/repos/${encodedRepository}/branches/${encodedBranch}`),
        github(`/repos/${encodedRepository}/rules/branches/${encodedBranch}?per_page=100`),
    ]);

    if (branchState?.protected !== true) {
        fail(`Branch ${branch} is not protected by an active branch policy.`);
    }

    if (!pullRequestRuleIsStrict(ruleOfType(activeRules, 'pull_request'))) {
        fail(`Branch ${branch} does not require strict CODEOWNERS pull-request review.`);
    }
    for (const ruleType of ['deletion', 'non_fast_forward']) {
        if (!ruleOfType(activeRules, ruleType)) {
            fail(`Branch ${branch} does not enforce the [${ruleType}] protection rule.`);
        }
    }

    const requirements = new Map();
    for (const context of REQUIRED_CHECKS) {
        const required = statusCheckRules(activeRules)
            .map((rule) => ruleRequirement(rule, context))
            .find(Boolean);
        if (!required) {
            fail(`Branch ${branch} does not strictly require [${context}] from one pinned GitHub App.`);
        }
        requirements.set(context, required);
    }

    if (rulesOnly) {
        process.stdout.write(
            `Quality and concurrency governance are active on ${repository}:${branch}.\n`,
        );
        process.exit(0);
    }

    const headSha = String(branchState?.commit?.sha || '');
    if (!/^[a-f0-9]{40}$/.test(headSha)) {
        fail('The protected branch head commit could not be resolved.');
    }

    const checkRuns = await github(
        `/repos/${encodedRepository}/commits/${headSha}/check-runs?filter=latest&per_page=100`,
    );
    const successful = Array.isArray(checkRuns?.check_runs)
        && REQUIRED_CHECKS.every((context) => {
            const requiredCheck = requirements.get(context);

            return checkRuns.check_runs.some((check) => check?.name === context
                && check?.app?.slug === 'github-actions'
                && check?.app?.id === requiredCheck.integration_id
                && check?.status === 'completed'
                && check?.conclusion === 'success');
        });

    if (!successful) {
        fail(`The latest ${branch} commit does not have every required GitHub Actions quality and concurrency result.`);
    }

    process.stdout.write(JSON.stringify({
        repository,
        branch,
        head_sha: headSha,
        protected: true,
        strict_pull_request_review: true,
        deletion_protected: true,
        force_push_protected: true,
        strict_required_checks: REQUIRED_CHECKS,
        latest_check_conclusion: 'success',
    }, null, 2) + '\n');
} catch (error) {
    fail(error instanceof Error ? error.message : 'GitHub governance verification failed.');
}
