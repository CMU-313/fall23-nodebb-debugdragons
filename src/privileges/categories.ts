import * as _ from 'lodash'

import categories from '../categories'
import user from '../user'
import groups from '../groups'
import helpers from './helpers'
import plugins from '../plugins'
import utils from '../utils'

interface PrivsCategories {
    _coreSize: number;
    getUserPrivilegeList: () => Promise<string[]>;
    getGroupPrivilegeList: () => Promise<string[]>;
    getPrivilegeList: (this: PrivsCategories) => Promise<string[]>;
    init: () => Promise<void>;
    list: (cid: number) => Promise<ListPayload>;
    get: (cid: number, uid: number) => Promise<PrivilegeData>;
    isAdminOrMod: (cid: number, uid: string) => Promise<boolean>;
    isUserAllowedTo: (privilege: string, cid: number, uid: number) => Promise<boolean | boolean[]>;
    can: (privilege: string, cid: number, uid: number) => Promise<boolean>;
    filterCids: (privilege: string, cids: number[], uid: number) => Promise<(number)[]>;
    getBase: (privilege: string, cids: number[], uid: number) => Promise<BasePayload>;
    filterUids: (privilege: string, cid: number, uids: number[]) => Promise<number[]>;
    give(privileges: string[], cid: number, members: string, callback: (error?: Error | null) => void): void;
    rescind(privileges: string[], cid: number, members: string, callback: (error?: Error | null) => void): void;
    canMoveAllTopics: (currentCid: number, targetCid: number, uid: number) => Promise<boolean>;
    userPrivileges: (cid: number, uid: number) => Promise<Record<string, boolean>> ;
    groupPrivileges: (cid: number, groupName: string) => Promise<Record<string, boolean>> ;
}

interface PrivilegeEntry {
    label: string;
}

interface ListPayload {
    labels: {
        users: string[],
        groups: string[]
    },
    users: string[], // Replace with the actual type if known
    groups: string[], // Replace with the actual type if known
    keys: {
        users: string[],
        groups: string[]
    },
    columnCountUserOther: number,
    columnCountGroupOther: number
}

interface PrivilegeData {
    [key: string]: boolean | string | number;
    editable: boolean;
    view_deleted: boolean;
    isAdminOrMod: boolean;
}

interface CategoryField {
    disabled: boolean;
}

interface BasePayload {
    categories: CategoryField[];
    allowedTo: boolean[];
    view_deleted: boolean[];
    view_scheduled: boolean[];
    isAdmin: boolean;
}

// The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call

/**
 * Looking to add a new category privilege via plugin/theme? Attach a hook to
 * `static:privileges.category.init` and call .set() on the privilege map passed
 * in to your listener.
 */
const _privilegeMap = new Map<string, PrivilegeEntry>([
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
    ['moderate', { label: '[[admin/manage/privileges:moderate]]' }]
])

const privsCategories: PrivsCategories = {
    _coreSize: 0,

    getUserPrivilegeList: async (): Promise<string[]> => await plugins.hooks.fire('filter:privileges.list', Array.from(_privilegeMap.keys())) as Promise<string[]>,

    getGroupPrivilegeList: async (): Promise<string[]> => await plugins.hooks.fire('filter:privileges.groups.list', Array.from(_privilegeMap.keys()).map(privilege => `groups:${privilege}`)) as Promise<string[]>,

    getPrivilegeList: async function (this: PrivsCategories): Promise<string[]> {
        const [user, group]: [string[], string[]] = await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            this.getUserPrivilegeList(),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            this.getGroupPrivilegeList()
        ])
        return user.concat(group)
    },

    init: async function (this: PrivsCategories): Promise<void> {
        this._coreSize = _privilegeMap.size
        await plugins.hooks.fire('static:privileges.categories.init', {
            privileges: _privilegeMap
        })
    },

    // Method used in admin/category controller to show all users/groups with privs in that given cid
    list: async function (this: PrivsCategories, cid: number): Promise<ListPayload> {
        let labels = Array.from(_privilegeMap.values()).map(data => data.label)
        labels = await utils.promiseParallel({
            users: plugins.hooks.fire('filter:privileges.list_human', labels.slice()),
            groups: plugins.hooks.fire('filter:privileges.groups.list_human', labels.slice())
        })

        const keys = await utils.promiseParallel({
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            users: this.getUserPrivilegeList(),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            groups: this.getGroupPrivilegeList()
        })

        const payload: Partial<ListPayload> = await utils.promiseParallel({
            labels,
            users: helpers.getUserPrivileges(cid, keys.users),
            groups: helpers.getGroupPrivileges(cid, keys.groups)
        })
        payload.keys = keys

        payload.columnCountUserOther = payload.labels.users.length - this._coreSize
        payload.columnCountGroupOther = payload.labels.groups.length - this._coreSize

        return payload as ListPayload
    },

    get: async function (cid: number, uid: number): Promise<PrivilegeData> {
        const privs: string[] = [
            'topics:create', 'topics:read', 'topics:schedule',
            'topics:tag', 'read', 'posts:view_deleted'
        ]

        const [userPrivileges, isAdministrator, isModerator]: [boolean[], boolean, boolean] = await Promise.all([
            helpers.isAllowedTo(privs, uid, cid) as boolean[],
            user.isAdministrator(uid) as boolean,
            user.isModerator(uid, cid) as boolean
        ])

        const combined: boolean[] = userPrivileges.map(allowed => allowed || isAdministrator)
        const privData: Record<string, boolean> = _.zipObject(privs, combined)
        const isAdminOrMod: boolean = isAdministrator || isModerator

        return await plugins.hooks.fire('filter:privileges.categories.get', {
            ...privData,
            cid,
            uid,
            editable: isAdminOrMod,
            view_deleted: isAdminOrMod || privData['posts:view_deleted'],
            isAdminOrMod
        }) as PrivilegeData
    },

    isAdminOrMod: async function (this: PrivsCategories, cid: number, uid: string): Promise<boolean> {
        if (parseInt(uid, 10) <= 0) {
            return false
        }
        const [isAdmin, isMod]: [boolean, boolean] = await Promise.all([
            user.isAdministrator(uid) as boolean,
            user.isModerator(uid, cid) as boolean
        ])
        return isAdmin || isMod
    },

    isUserAllowedTo: async function (
        privilege: string,
        cid: number,
        uid: number
    ): Promise<boolean | boolean[]> {
        if ((Array.isArray(privilege) && !privilege.length) || (Array.isArray(cid) && !cid.length)) {
            return []
        }
        if (!cid) {
            return false
        }
        const results: Promise<boolean | boolean[]> = await helpers.isAllowedTo(
            privilege,
            uid,
            Array.isArray(cid) ? cid : [cid]
        ) as Promise<boolean | boolean[]>

        if (Array.isArray(results) && results.length) {
            return Array.isArray(cid) ? results : results[0] as boolean | boolean[]
        }
        return false
    },

    can: async function (privilege: string, cid: string | number, uid: string | number): Promise<boolean> {
        if (!cid) {
            return false
        }
        const [disabled, isAdmin, isAllowed]: [boolean, boolean, boolean] = await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            categories.getCategoryField(cid, 'disabled') as boolean,
            user.isAdministrator(uid) as boolean,
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            this.isUserAllowedTo(privilege, cid, uid) as boolean
        ])

        // For Endorse Answers Only.
        let isInstructor
        if (privilege === 'posts:upvote') {
            isInstructor = await user.isInstructor(uid)
            return !disabled && (isInstructor || isAdmin) as boolean
        }

        return !disabled && (isAllowed || isAdmin)
    },

    filterCids: async function (
        privilege: string,
        cids: number[],
        uid: number
    ): Promise<number[]> {
        if (!Array.isArray(cids) || !cids.length) {
            return []
        }

        cids = _.uniq(cids)
        const [categoryData, allowedTo, isAdmin]:
            [Array<{ disabled: boolean }>, boolean[], boolean] = await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            categories.getCategoriesFields(cids, ['disabled']) as Array<{ disabled: boolean }>,
            helpers.isAllowedTo(privilege, uid, cids) as boolean[],
            user.isAdministrator(uid) as boolean
            ])
        return cids.filter(
            (cid, index) => !!cid && !categoryData[index].disabled && (allowedTo[index] || isAdmin)
        )
    },

    getBase: async function (privilege: string, cids: number[], uid: number): Promise<BasePayload> {
        return await utils.promiseParallel({
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            categories: categories.getCategoriesFields(cids, ['disabled']) as CategoryField,
            allowedTo: helpers.isAllowedTo(privilege, uid, cids) as boolean[],
            view_deleted: helpers.isAllowedTo('posts:view_deleted', uid, cids) as boolean[],
            view_scheduled: helpers.isAllowedTo('topics:schedule', uid, cids) as boolean[],
            isAdmin: user.isAdministrator(uid) as boolean
        })
    },

    filterUids: async function (
        privilege: string,
        cid: number,
        uids: number[]
    ): Promise<number[]> {
        if (!uids.length) {
            return []
        }

        uids = _.uniq(uids)

        const [allowedTo, isAdmins]: [boolean, boolean[]] = await Promise.all([
            helpers.isUsersAllowedTo(privilege, uids, cid) as boolean,
            user.isAdministrator(uids) as boolean[]
        ])
        return uids.filter((uid, index) => allowedTo[index] || isAdmins[index])
    },

    give (privileges, cid, members, callback) {
        helpers
            .giveOrRescind(groups.join, privileges, cid, members)
            .then(() => plugins.hooks.fire('action:privileges.categories.give', {
                privileges,
                cids: Array.isArray(cid) ? cid : [cid],
                members: Array.isArray(members) ? members : [members]
            }))
            .then(() => callback(null))
            .catch((error: Error) => callback(error))
    },

    rescind (privileges, cid, members, callback) {
        helpers
            .giveOrRescind(groups.leave, privileges, cid, members)
            .then(() => plugins.hooks.fire('action:privileges.categories.rescind', {
                privileges,
                cids: Array.isArray(cid) ? cid : [cid],
                members: Array.isArray(members) ? members : [members]
            }))
            .then(() => callback(null))
            .catch((error: Error) => callback(error))
    },

    canMoveAllTopics: async function (currentCid: number, targetCid: number, uid: number): Promise<boolean> {
        const [isAdmin, isModerators]: [boolean, boolean[]] = await Promise.all([
            user.isAdministrator(uid) as boolean,
            user.isModerator(uid, [currentCid, targetCid]) as boolean[]
        ])
        return isAdmin || !isModerators.includes(false)
    },

    userPrivileges: async function (
        this: PrivsCategories,
        cid: number,
        uid: number
    ): Promise<Record<string, boolean>> {
        const userPrivilegeList = await this.getUserPrivilegeList()
        return await helpers.userOrGroupPrivileges(cid, uid, userPrivilegeList)
    },

    groupPrivileges: async function (
        this: PrivsCategories,
        cid:number,
        groupName: string
    ): Promise<Record<string, boolean>> {
        const groupPrivilegeList = await this.getGroupPrivilegeList()
        return await helpers.userOrGroupPrivileges(cid, groupName, groupPrivilegeList)
    }
}

export = privsCategories;
