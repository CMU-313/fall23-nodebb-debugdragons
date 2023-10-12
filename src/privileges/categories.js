"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const _ = __importStar(require("lodash"));
const categories_1 = __importDefault(require("../categories"));
const user_1 = __importDefault(require("../user"));
const groups_1 = __importDefault(require("../groups"));
const helpers_1 = __importDefault(require("./helpers"));
const plugins_1 = __importDefault(require("../plugins"));
const utils_1 = __importDefault(require("../utils"));
// The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
/**
 * Looking to add a new category privilege via plugin/theme? Attach a hook to
 * `static:privileges.category.init` and call .set() on the privilege map passed
 * in to your listener.
 */
const _privilegeMap = new Map([
    ['find', { label: '[[admin/manage/privileges:find-category]]' }],
    ['read', { label: '[[admin/manage/privileges:access-category]]' }],
    ['topics:read', { label: '[[admin/manage/privileges:access-topics]]' }],
    ['topics:create', { label: '[[admin/manage/privileges:create-topics]]' }],
    ['topics:reply', { label: '[[admin/manage/privileges:reply-to-topics]]' }],
    ['topics:schedule', { label: '[[admin/manage/privileges:schedule-topics]]' }],
    ['topics:tag', { label: '[[admin/manage/privileges:tag-topics]]' }],
    ['posts:edit', { label: '[[admin/manage/privileges:edit-posts]]' }],
    ['posts:history', { label: '[[admin/manage/privileges:view-edit-history]]' }],
    ['posts:delete', { label: '[[admin/manage/privileges:delete-posts]]' }],
    ['posts:upvote', { label: '[[admin/manage/privileges:upvote-posts]]' }],
    ['posts:downvote', { label: '[[admin/manage/privileges:downvote-posts]]' }],
    ['topics:delete', { label: '[[admin/manage/privileges:delete-topics]]' }],
    ['posts:view_deleted', { label: '[[admin/manage/privileges:view_deleted]]' }],
    ['purge', { label: '[[admin/manage/privileges:purge]]' }],
    ['moderate', { label: '[[admin/manage/privileges:moderate]]' }],
]);
const privsCategories = {
    _coreSize: 0,
    getUserPrivilegeList: () => __awaiter(void 0, void 0, void 0, function* () { return yield plugins_1.default.hooks.fire('filter:privileges.list', Array.from(_privilegeMap.keys())); }),
    getGroupPrivilegeList: () => __awaiter(void 0, void 0, void 0, function* () { return yield plugins_1.default.hooks.fire('filter:privileges.groups.list', Array.from(_privilegeMap.keys()).map(privilege => `groups:${privilege}`)); }),
    getPrivilegeList: function () {
        return __awaiter(this, void 0, void 0, function* () {
            const [user, group] = yield Promise.all([
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                this.getUserPrivilegeList(),
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                this.getGroupPrivilegeList(),
            ]);
            return user.concat(group);
        });
    },
    init: function () {
        return __awaiter(this, void 0, void 0, function* () {
            this._coreSize = _privilegeMap.size;
            yield plugins_1.default.hooks.fire('static:privileges.categories.init', {
                privileges: _privilegeMap,
            });
        });
    },
    // Method used in admin/category controller to show all users/groups with privs in that given cid
    list: function (cid) {
        return __awaiter(this, void 0, void 0, function* () {
            let labels = Array.from(_privilegeMap.values()).map(data => data.label);
            labels = yield utils_1.default.promiseParallel({
                users: plugins_1.default.hooks.fire('filter:privileges.list_human', labels.slice()),
                groups: plugins_1.default.hooks.fire('filter:privileges.groups.list_human', labels.slice()),
            });
            const keys = yield utils_1.default.promiseParallel({
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                users: this.getUserPrivilegeList(),
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                groups: this.getGroupPrivilegeList(),
            });
            const payload = yield utils_1.default.promiseParallel({
                labels,
                users: helpers_1.default.getUserPrivileges(cid, keys.users),
                groups: helpers_1.default.getGroupPrivileges(cid, keys.groups),
            });
            payload.keys = keys;
            payload.columnCountUserOther = payload.labels.users.length - this._coreSize;
            payload.columnCountGroupOther = payload.labels.groups.length - this._coreSize;
            return payload;
        });
    },
    get: function (cid, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            const privs = [
                'topics:create', 'topics:read', 'topics:schedule',
                'topics:tag', 'read', 'posts:view_deleted',
            ];
            const [userPrivileges, isAdministrator, isModerator] = yield Promise.all([
                helpers_1.default.isAllowedTo(privs, uid, cid),
                user_1.default.isAdministrator(uid),
                user_1.default.isModerator(uid, cid),
            ]);
            const combined = userPrivileges.map(allowed => allowed || isAdministrator);
            const privData = _.zipObject(privs, combined);
            const isAdminOrMod = isAdministrator || isModerator;
            return yield plugins_1.default.hooks.fire('filter:privileges.categories.get', Object.assign(Object.assign({}, privData), { cid: cid, uid: uid, editable: isAdminOrMod, view_deleted: isAdminOrMod || privData['posts:view_deleted'], isAdminOrMod: isAdminOrMod }));
        });
    },
    isAdminOrMod: function (cid, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            if (parseInt(uid, 10) <= 0) {
                return false;
            }
            const [isAdmin, isMod] = yield Promise.all([
                user_1.default.isAdministrator(uid),
                user_1.default.isModerator(uid, cid),
            ]);
            return isAdmin || isMod;
        });
    },
    isUserAllowedTo: function (privilege, cid, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            if ((Array.isArray(privilege) && !privilege.length) || (Array.isArray(cid) && !cid.length)) {
                return [];
            }
            if (!cid) {
                return false;
            }
            const results = yield helpers_1.default.isAllowedTo(privilege, uid, Array.isArray(cid) ? cid : [cid]);
            if (Array.isArray(results) && results.length) {
                return Array.isArray(cid) ? results : results[0];
            }
            return false;
        });
    },
    can: function (privilege, cid, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!cid) {
                return false;
            }
            const [disabled, isAdmin, isAllowed] = yield Promise.all([
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                categories_1.default.getCategoryField(cid, 'disabled'),
                user_1.default.isAdministrator(uid),
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                this.isUserAllowedTo(privilege, cid, uid),
            ]);
            // For Endorse Answers Only.
            let isInstructor;
            if (privilege === 'posts:upvote') {
                isInstructor = yield user_1.default.isInstructor(uid);
                return !disabled && (isInstructor || isAdmin);
            }
            return !disabled && (isAllowed || isAdmin);
        });
    },
    filterCids: function (privilege, cids, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Array.isArray(cids) || !cids.length) {
                return [];
            }
            cids = _.uniq(cids);
            const [categoryData, allowedTo, isAdmin] = yield Promise.all([
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                categories_1.default.getCategoriesFields(cids, ['disabled']),
                helpers_1.default.isAllowedTo(privilege, uid, cids),
                user_1.default.isAdministrator(uid),
            ]);
            return cids.filter((cid, index) => !!cid && !categoryData[index].disabled && (allowedTo[index] || isAdmin));
        });
    },
    getBase: function (privilege, cids, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield utils_1.default.promiseParallel({
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                categories: categories_1.default.getCategoriesFields(cids, ['disabled']),
                allowedTo: helpers_1.default.isAllowedTo(privilege, uid, cids),
                view_deleted: helpers_1.default.isAllowedTo('posts:view_deleted', uid, cids),
                view_scheduled: helpers_1.default.isAllowedTo('topics:schedule', uid, cids),
                isAdmin: user_1.default.isAdministrator(uid),
            });
        });
    },
    filterUids: function (privilege, cid, uids) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!uids.length) {
                return [];
            }
            uids = _.uniq(uids);
            const [allowedTo, isAdmins] = yield Promise.all([
                helpers_1.default.isUsersAllowedTo(privilege, uids, cid),
                user_1.default.isAdministrator(uids),
            ]);
            return uids.filter((uid, index) => allowedTo[index] || isAdmins[index]);
        });
    },
    give(privileges, cid, members, callback) {
        helpers_1.default
            .giveOrRescind(groups_1.default.join, privileges, cid, members)
            .then(() => plugins_1.default.hooks.fire('action:privileges.categories.give', {
            privileges,
            cids: Array.isArray(cid) ? cid : [cid],
            members: Array.isArray(members) ? members : [members],
        }))
            .then(() => callback(null))
            .catch((error) => callback(error));
    },
    rescind(privileges, cid, members, callback) {
        helpers_1.default
            .giveOrRescind(groups_1.default.leave, privileges, cid, members)
            .then(() => plugins_1.default.hooks.fire('action:privileges.categories.rescind', {
            privileges,
            cids: Array.isArray(cid) ? cid : [cid],
            members: Array.isArray(members) ? members : [members],
        }))
            .then(() => callback(null))
            .catch((error) => callback(error));
    },
    canMoveAllTopics: function (currentCid, targetCid, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            const [isAdmin, isModerators] = yield Promise.all([
                user_1.default.isAdministrator(uid),
                user_1.default.isModerator(uid, [currentCid, targetCid]),
            ]);
            return isAdmin || !isModerators.includes(false);
        });
    },
    userPrivileges: function (cid, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            const userPrivilegeList = yield this.getUserPrivilegeList();
            return yield helpers_1.default.userOrGroupPrivileges(cid, uid, userPrivilegeList);
        });
    },
    groupPrivileges: function (cid, groupName) {
        return __awaiter(this, void 0, void 0, function* () {
            const groupPrivilegeList = yield this.getGroupPrivilegeList();
            return yield helpers_1.default.userOrGroupPrivileges(cid, groupName, groupPrivilegeList);
        });
    },
};
module.exports = privsCategories;
