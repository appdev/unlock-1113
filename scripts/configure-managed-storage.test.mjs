import assert from "node:assert/strict";
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";

test("build origin accepts only HTTPS origins and preserves unrelated files", () => {
    const root = mkdtempSync(join(tmpdir(), "managed-storage-origin-"));
    const target = join(root, "kernel/model/managed_storage_origin.go");
    mkdirSync(join(root, "kernel/model"), {recursive: true});
    const run = value => spawnSync(process.execPath, [new URL("./configure-managed-storage.mjs", import.meta.url).pathname, root], {
        env: {...process.env, SIYUAN_MANAGED_STORAGE_ORIGIN: value}, encoding: "utf8",
    });
    try {
        for (const invalid of ["http://service.example", "https://user:password@service.example", "https://service.example/path", "https://service.example?token=value", "https://service.example/#fragment", "https://service.example\\other"]) {
            assert.notEqual(run(invalid).status, 0);
        }
        assert.equal(run("https://service.example:8443/").status, 0);
        assert.match(readFileSync(target, "utf8"), /ManagedStorageOrigin = "https:\/\/service\.example:8443"/);
        assert.equal(run("").status, 0);
        assert.match(readFileSync(target, "utf8"), /ManagedStorageOrigin = ""/);
        writeFileSync(target, "package model\n// user file\n");
        assert.notEqual(run("https://service.example").status, 0);
        assert.equal(readFileSync(target, "utf8"), "package model\n// user file\n");
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
});
