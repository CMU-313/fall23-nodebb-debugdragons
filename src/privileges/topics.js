const _ = require('lodash')
const assert = require('assert')

const meta = require('../meta')
const topics = require('../topics')
const user = require('../user')
const helpers = require('./helpers')
const categories = require('../categories')
const plugins = require('../plugins')
const privsCategories = require('./categories')

const privsTopics = module.exports

/**
 * Gets topics by tid and uid
 * @param {Promise<string> || Promise<number>} tid
 * @param {Promise<number>} uid
* @returns {Promise<object>}
 */
privsTopics.get = async function (tid, uid) {
    // Assert function parameter types in the body
    assert(typeof tid === 'number' || typeof tid === 'string', 'Expected tid to be a number or string')
    assert(typeof uid === 'number', '[[error:no-privileges]]')
    uid = parseInt(uid, 10)

    const privs = [
        'topics:reply', 'topics:read', 'topics:schedule', 'topics:tag',
        'topics:delete', 'posts:edit', 'posts:history',
        'posts:delete', 'posts:view_deleted', 'read', 'purge'
    ]
    const topicData = await topics.getTopicFields(tid, ['cid', 'uid', 'locked', 'deleted', 'scheduled'])
    const [userPrivileges, isAdministrator, isModerator, isInstructor, disabled] = await Promise.all([
        helpers.isAllowedTo(privs, uid, topicData.cid),
        user.isAdministrator(uid),
        user.isModerator(uid, topicData.cid),
        user.isInstructor(uid),
        categories.getCategoryField(topicData.cid, 'disabled')
    ])
    const privData = _.zipObject(privs, userPrivileges)
    const isOwner = uid > 0 && uid === topicData.uid
    const isAdminOrMod = isAdministrator || isModerator
    const editable = isAdminOrMod || isInstructor
    const deletable = (privData['topics:delete'] && (isOwner || isModerator)) || isAdministrator
    const mayReply = privsTopics.canViewDeletedScheduled(topicData, {}, false, privData['topics:schedule'])

    const result = await plugins.hooks.fire('filter:privileges.topics.get', {
        'topics:reply': (privData['topics:reply'] && ((!topicData.locked && mayReply) || isModerator)) || isAdministrator,
        'topics:read': privData['topics:read'] || isAdministrator,
        'topics:schedule': privData['topics:schedule'] || isAdministrator,
        'topics:tag': privData['topics:tag'] || isAdministrator,
        'topics:delete': (privData['topics:delete'] && (isOwner || isModerator)) || isAdministrator,
        'posts:edit': (privData['posts:edit'] && (!topicData.locked || isModerator)) || isAdministrator,
        'posts:history': privData['posts:history'] || isAdministrator,
        'posts:delete': (privData['posts:delete'] && (!topicData.locked || isModerator)) || isAdministrator,
        'posts:view_deleted': privData['posts:view_deleted'] || isAdministrator,
        read: privData.read || isAdministrator,
        purge: (privData.purge && (isOwner || isModerator)) || isAdministrator,
        view_thread_tools: editable || deletable,
        editable,
        deletable,
        view_deleted: isAdminOrMod || isOwner || privData['posts:view_deleted'],
        view_scheduled: privData['topics:schedule'] || isAdministrator,
        isAdminOrMod,
        isInstructor,
        isOwner,
        disabled,
        tid,
        uid
    })
    // Assert function return types in the body
    assert(typeof result === 'object', 'result should be an object')
    return result
}

/**
 * Checks if user gets privilege to topic
 * @param {Promise<string>} privilege
 * @param {Promise<string> || Promise<number>} tid
 * @param {Promise<number>} uid
* @returns {Promise<boolean>}
 */
privsTopics.can = async function (privilege, tid, uid) {
    // Assert function parameter types in the body
    assert(typeof privilege === 'string', 'Expected privilege to be a string')
    assert(typeof tid === 'number' || typeof tid === 'string', 'Expected tid to be a number or string')
    assert(typeof uid === 'number', '[[error:no-privileges]]')
    const cid = await topics.getTopicField(tid, 'cid')
    const canResult = await privsCategories.can(privilege, cid, uid)
    // Assert function return types in the body
    assert(typeof canResult === 'boolean', 'result should be a boolean')
    return canResult
}

/**
 * Filters tids
 * @param {Promise<string>} privilege
 * @param {Promise<Array<string>>} tids
 * @param {Promise<number>} uid
* @returns {Promise<object>}
 */
privsTopics.filterTids = async function (privilege, tids, uid) {
    // Assert function parameter types in the body
    if (!Array.isArray(tids) || !tids.length) {
        return []
    }
    assert(typeof privilege === 'string', 'Expected privilege to be a string')
    assert(typeof uid === 'number', '[[error:no-privileges]]')
    const topicsData = await topics.getTopicsFields(tids, ['tid', 'cid', 'deleted', 'scheduled'])
    const cids = _.uniq(topicsData.map(topic => topic.cid))
    const results = await privsCategories.getBase(privilege, cids, uid)

    const allowedCids = cids.filter((cid, index) => (
        !results.categories[index].disabled &&
        (results.allowedTo[index] || results.isAdmin)
    ))

    const cidsSet = new Set(allowedCids)
    const canViewDeleted = _.zipObject(cids, results.view_deleted)
    const canViewScheduled = _.zipObject(cids, results.view_scheduled)

    tids = topicsData.filter(t => (
        cidsSet.has(t.cid) &&
        (results.isAdmin || privsTopics.canViewDeletedScheduled(t, {}, canViewDeleted[t.cid], canViewScheduled[t.cid]))
    )).map(t => t.tid)

    const data = await plugins.hooks.fire('filter:privileges.topics.filter', {
        privilege,
        uid,
        tids
    })
    const tidsResult = data ? data.tids : []
    // Assert function return types in the body
    assert(typeof tidsResult === 'object', 'Expected result to be an object')
    return tidsResult
}

/**
 * Filters uids
 * @param {Promise<string>} privilege
 * @param {Promise<number>} tid
 * @param {Promise<Array<number>>} uids
* @returns {Promise<object>}
 */
privsTopics.filterUids = async function (privilege, tid, uids) {
    // Assert function parameter types in the body
    if (!Array.isArray(uids) || !uids.length) {
        return []
    }
    assert(typeof privilege === 'string', 'Expected privilege to be a string')
    assert(typeof tid === 'number' || typeof tid === 'string', 'Expected tid to be a number or stirng')
    uids = _.uniq(uids)
    const topicData = await topics.getTopicFields(tid, ['tid', 'cid', 'deleted', 'scheduled'])
    const [disabled, allowedTo, isAdmins] = await Promise.all([
        categories.getCategoryField(topicData.cid, 'disabled'),
        helpers.isUsersAllowedTo(privilege, uids, topicData.cid),
        user.isAdministrator(uids)
    ])

    if (topicData.scheduled) {
        const canViewScheduled = await helpers.isUsersAllowedTo('topics:schedule', uids, topicData.cid)
        uids = uids.filter((uid, index) => canViewScheduled[index])
    }
    const uidsResult = uids.filter((uid, index) => !disabled &&
        ((allowedTo[index] && (topicData.scheduled || !topicData.deleted)) || isAdmins[index]))
    // Assert function return types in the body
    assert(typeof uidsResult === 'object', 'Expected result to be an object')
    return uidsResult
}

/**
 * Checks if topic is purgable
 * @param {Promise<string> || Promise<number>} tid
 * @param {Promise<number>} uid
* @returns {Promise<boolean>}
 */
privsTopics.canPurge = async function (tid, uid) {
    // Assert function parameter types in the body
    assert(typeof tid === 'number' || typeof tid === 'string', 'Expected tid to be a number or string')
    assert(typeof uid === 'number', 'Expected uid to be a number')
    const cid = await topics.getTopicField(tid, 'cid')
    const [purge, owner, isAdmin, isModerator] = await Promise.all([
        privsCategories.isUserAllowedTo('purge', cid, uid),
        topics.isOwner(tid, uid),
        user.isAdministrator(uid),
        user.isModerator(uid, cid)
    ])
    const result = (purge && (owner || isModerator)) || isAdmin
    // Assert function return types in the body
    assert(typeof result === 'boolean', 'Expected result to be a boolean')
    return result
}

/**
 * Checks if topic is deletable
 * @param {Promise<string> || Promise<number>} tid
 * @param {Promise<number>} uid
* @returns {Promise<boolean>}
 */
privsTopics.canDelete = async function (tid, uid) {
    // Assert function parameter types in the body
    assert(typeof tid === 'number' || typeof tid === 'string', 'Expected tid to be a number or string')
    assert(typeof uid === 'number', 'Expected uid to be a number')
    const topicData = await topics.getTopicFields(tid, ['uid', 'cid', 'postcount', 'deleterUid'])
    const [isModerator, isAdministrator, isOwner, allowedTo] = await Promise.all([
        user.isModerator(uid, topicData.cid),
        user.isAdministrator(uid),
        topics.isOwner(tid, uid),
        helpers.isAllowedTo('topics:delete', uid, [topicData.cid])
    ])

    if (isAdministrator) {
        return true
    }

    const { preventTopicDeleteAfterReplies } = meta.config
    if (!isModerator && preventTopicDeleteAfterReplies && (topicData.postcount - 1) >= preventTopicDeleteAfterReplies) {
        const langKey = preventTopicDeleteAfterReplies > 1
            ? `[[error:cant-delete-topic-has-replies, ${meta.config.preventTopicDeleteAfterReplies}]]`
            : '[[error:cant-delete-topic-has-reply]]'
        throw new Error(langKey)
    }

    const { deleterUid } = topicData
    const result = allowedTo[0] && ((isOwner && (deleterUid === 0 || deleterUid === topicData.uid)) || isModerator)
    // Assert function return types in the body
    assert(typeof result === 'boolean', 'Expected result to be a boolean')
    return result
}

/**
 * Checks if topic can be edited
 * @param {Promise<string> || Promise<number>} tid
 * @param {Promise<number>} uid
* @returns {Promise<boolean>}
 */
privsTopics.canEdit = async function (tid, uid) {
    // Assert function parameter types in the body
    assert(typeof tid === 'number' || typeof tid === 'string', 'Expected tid to be a number or string')
    assert(typeof uid === 'number', 'Expected uid to be a number')
    const result = await privsTopics.isOwnerOrAdminOrMod(tid, uid)
    // Assert function return types in the body
    assert(typeof result === 'boolean', 'Expected result to be a boolean')
    return result
}

/**
 * Checks if user is owner, admin, or mod of topic
 * @param {Promise<string> || Promise<number>} tid
 * @param {Promise<number>} uid
* @returns {Promise<boolean>}
 */
privsTopics.isOwnerOrAdminOrMod = async function (tid, uid) {
    // Assert function parameter types in the body
    assert(typeof tid === 'number' || typeof tid === 'string', 'Expected tid to be a number or string')
    assert(typeof uid === 'number', 'Expected uid to be a number')
    const [isOwner, isAdminOrMod] = await Promise.all([
        topics.isOwner(tid, uid),
        privsTopics.isAdminOrMod(tid, uid)
    ])
    const result = isOwner || isAdminOrMod
    // Assert function return types in the body
    assert(typeof result === 'boolean', 'Expected result to be a boolean')
    return result
}

/**
 * Checks if user is admin, or mod of topic
 * @param {Promise<string> || Promise<number>} tid
 * @param {Promise<number>} uid
* @returns {Promise<boolean>}
 */
privsTopics.isAdminOrMod = async function (tid, uid) {
    // Assert function parameter types in the body
    assert(typeof tid === 'number' || typeof tid === 'string', 'Expected tid to be a number or string')
    assert(typeof uid === 'number', 'Expected uid to be a number')
    if (parseInt(uid, 10) <= 0) {
        return false
    }
    const cid = await topics.getTopicField(tid, 'cid')
    const result = await privsCategories.isAdminOrMod(cid, uid)
    // Assert function return types in the body
    assert(typeof result === 'boolean', 'Expected result to be a boolean')
    return result
}

/**
 * Function to check if a user has privileges to view deleted or scheduled topics
 * @param {Promise<object>} topic
 * @param {Promise<object>} privileges
 * @param {Promise<boolean>} viewDeleted
 * @param {Promise<boolean>} viewScheduled
 * @returns {Promise<boolean>}
 */
privsTopics.canViewDeletedScheduled = function (topic, privileges = {}, viewDeleted = false, viewScheduled = false) {
    // Assert function parameter types in the body
    if (typeof topic !== 'object') {
        return false
    }
    if (typeof privileges !== 'object') {
        return false
    }

    if (typeof viewDeleted !== 'boolean') {
        return false
    }
    if (typeof viewScheduled !== 'boolean') {
        return false
    }
    if (!topic) {
        return false
    }
    const { deleted = false, scheduled = false } = topic
    const { view_deleted = viewDeleted, view_scheduled = viewScheduled } = privileges

    // conceptually exclusive, scheduled topics deemed to be not deleted (they can only be purged)
    if (scheduled) {
        return view_scheduled
    } else if (deleted) {
        return view_deleted
    }

    return true
}
