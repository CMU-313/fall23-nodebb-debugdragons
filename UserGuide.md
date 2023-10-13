# User Guide

## Table of Contents

Endorsing Answers
Question Pinning
Instructor Commented
Anonymous Posting
Unread Topics Highlight

## Endorsing Answers

The Endorse Answer allows for instructors to endorse a post made by a student.

This feature repurposes the voting feature.

### How to Use Feature

1. To use the Endorse feature, your account needs to meet one of the following:
    - The account type must be **instructor**
    - The account must be an **Admin**
    - The account must be a **Moderator**
2. Go to a topic or post.
3. For each post, there will be an **Endorse** button that can be clicked.
4. When clicked, the counter next to **Endorse** should increase by 1. 
5. Refresh the page, and a green **Endorse** box should appear below the Topic Title.
6. To undo endorsement, press the **Endorse** button, and the counter should decrease by 1, and the green **Endorse** button will disappear after refreshing the page.

### Automated Testing

Additional test were added to the following file for the feature:
1. [test/categories.js](fall23-nodebb-debugdragons/test/categories.js)
    - Lines 607 - 610: instructor upvote privilege granted.
    - Lines 612 - 615: admin / moderator endorse privilege granted
    - Lines 617 - 620: student upvote privilege denied
    - Lines 622 - 625: student without preset accounttype upvote privilege denied

These additional test are sufficient for covering the changes we made for the feature because the main logic behind allowing a user to endorse depends on if their accounttype is **instructor** or if they are in the **Admin/Moderators** groups. These tests essentially check that if the privilege is granted or not when the accounttype is **instructor** or **student**, and checks if being an **Admin** or **Moderator** is also granted the privilege.

## Question Pinning

The Question Pinning allows users that have their account type as instructor to pin posts. When posts are pinned, there is a pinned icon and the topic teaser is highlighted.

We are extending admin one admin privilege to instructors, which is being able to pin and unpin a post.

### How to Use Feature
1. To use the Question Pinning feature, your account needs to meet one of the following:
    - The account type must be **instructor**
    - The account must be an **Admin**
    - The account must be a **Moderator**
2. Go to a topic or post.
3. On the Header of the Topic/Posts, there should be three buttons on the upper-right corner. 
4. Select the rightmost, or 3rd button, and a dropdown should show up. Press **Pin Topic**.
5. When prompted with the expiration date of the pinned topic, either select a date or press continue.
6. The Topic will have an update conveying an instructor has pinned a topic.
7. In the Topic Teasers, the pinned topic should be the first one, and pinned topics are highlighted green for clearer visibility.
8. To unpin, repeat steps 2 - 4, but now the **Pin Topic** option will be **Unpin Topic**

### Automated Testing

Additional test were added to the following file for the feature:
1. [test/topics.js](fall23-nodebb-debugdragons/test/topics.js)
    - Lines 721 - 724: should show isInstructor privilege for instructor is true
    - Lines 726 - 729: should show isInstructor privilege for instructor is false
    - Lines 731 - 734: should show editable privilege for instructor is true
    - Lines 736 - 739: should show editable privilege for instructor is false
    - Lines 741 - 744: should show isOwner privilege for owner of topic is true
    - Lines 746 - 749: should show isOwner privilege for owner of topic is false
    - Lines 751 - 755: should pin topic for instructor
    - Lines 757 - 761: should unpin topic for instructor

These additional tests are sufficient for covering the changes we made for the feature because this feature utilizes the privileges that are granted for each user for a given category/topic. Therefore, we checked depending on the account (i.e student/instructor or admin/mod/instructor) if privilege was either granted or not based.

## Instructor Commented

### How to Use Feature
1. To use the Instructor Commented feature, your account needs to meet one of the following:
    - The account type must be **instructor**
2. Go to a topic or post.
3. Reply with any message.
4. In the Topic Teasers, the replied topic will have an "i" icon indicating that an instructor has commented on that topic

### Automated Testing

Additional test was added to the following file for the feature:
1. [test/topics.js](fall23-nodebb-debugdragons/test/topics.js)
    - Lines 331 - 335:  should change instructor count on reply

This additional test is sufficient for covering the changes we made for the feature because this feature utilizes the functions implemented by other features and tested in them. This test essentially checks that the instructor count increases by 1 if there has been a reply. 

## Anonymous Posting

### How to use Feature
1. Create a new topic
2. Add a tag "anonymous"
3. In the topic, users are now anonymised
4. Go to topics list
5. In the list the avatar will be anonymous

### Automated Testing

Additional test was added to the following file for the feature:
1. [test/topics.js](fall23-nodebb-debugdragons/test/topics.js)
Lines 139-153: should create a new anonymous topic

This additional test is sufficient for the new feature because the functions altered are already covered by the testing suite, and this is the only implemented functionality: marking the anonymous state of a topic.

## Unread Topics Highlight

### How to Use Feature
1. Mark any topic as unread
2. In the topic teasers, the unread topic will be highlighted in yellow

### Automated Testing

Unread feature is already implemented by NodeBB and testing for it is in the test suite. Our implementation just retrieves the tested information into the frontend and alters the display of unread topics to differentiate the posts from read topics to improve user experience.

