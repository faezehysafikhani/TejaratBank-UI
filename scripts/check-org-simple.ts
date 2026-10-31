// Checks the «ساخت سریع» outline parser of the simple organization chart.
import assert from 'node:assert/strict';
import { parseOutline } from '../src/components/admin/orgStructure/nodes/simpleKinds';

const ok = parseOutline('معاونت مالی\n  سمت: مدیر مالی\n    سمت: کارشناس فنی\n    سمت: کارشناس اداری\nمعاونت فنی', null);
assert.deepEqual(ok.errors, []);
assert.deepEqual(ok.lines.map((l) => [l.depth, l.kind, l.name]), [
  [0, 'post', 'معاونت مالی'], [1, 'role', 'مدیر مالی'], [2, 'role', 'کارشناس فنی'], [2, 'role', 'کارشناس اداری'], [0, 'post', 'معاونت فنی'],
]);
assert.equal(parseOutline('معاونت\n- سمت: مدیر', null).lines[1].depth, 1);
assert.equal(parseOutline('سمت: مدیر\n  معاونت', null).errors.length, 1, 'a post under a role is refused');
assert.equal(parseOutline('معاونت\n    سمت: مدیر', null).errors.length, 1, 'a jump of two levels is refused');
assert.equal(parseOutline('معاونت', 'role').errors.length, 1, 'a post directly under a role is refused');
assert.equal(parseOutline('   \n', null).errors.length, 1);
console.log('org simple outline OK');
