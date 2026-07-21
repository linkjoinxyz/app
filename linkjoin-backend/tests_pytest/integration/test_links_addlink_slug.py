"""GET /links/addlink copied the source link document while excluding only
_id, username and share -- so it inherited the source's `slug`.

links.slug carries a unique sparse index (app/main.py), so that insert raised
DuplicateKeyError and returned a 500 for every link that had a slug, which is
every link created since slugs were introduced. Accepting a shared link was
broken outright.

It also inherited `share_token`, which is the lookup key /addlink itself matches
on, so two documents answered to the same token.

The other two copy paths already handle this: links.share_link excludes both, and
classes._push_link_to_student excludes them and assigns a fresh slug.
"""
import pytest

from app.database import motor_db
from app.encryption import encrypt
from app.utils import gen_slug


async def _make_link(username: str, link_id: int, **extra):
    doc = {
        "username": username, "id": link_id, "name": "Standup",
        "link": encrypt("https://zoom.us/j/123"), "time": "9:00",
        "days": ["Mon"], "repeat": "week", "active": "true", "text": "false",
        "share_token": f"tok-{link_id}", "slug": gen_slug(),
        **extra,
    }
    await motor_db.links.insert_one(dict(doc))
    return doc


@pytest.fixture(autouse=True)
async def _slug_unique_index():
    """Production carries links.slug as a unique sparse index; the test database
    does not, because httpx's ASGITransport never runs the app's lifespan (the
    conftest comment claiming otherwise is mistaken, and `index_information()` on
    linkjoin_test comes back empty). Without the constraint the duplicate-slug
    insert this module exists to catch simply succeeds, so create it here.
    """
    await motor_db.links.create_index("slug", unique=True, sparse=True, name="slug_1_test")
    yield
    await motor_db.links.drop_index("slug_1_test")


@pytest.fixture
async def shared_source_link(premium_active_user):
    link_id = 991001
    doc = await _make_link(premium_active_user["username"], link_id)
    yield doc
    await motor_db.links.delete_many({"id": link_id})
    await motor_db.links.delete_many({"share_id": link_id})


async def test_accepting_a_shared_link_succeeds(as_user, personal_user_no_trial, shared_source_link):
    """This returned 500 (DuplicateKeyError on the unique slug index)."""
    resp = await as_user(personal_user_no_trial).get(
        f"/links/addlink?id={shared_source_link['share_token']}"
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "Added"


async def test_copy_gets_its_own_slug_and_share_token(
    as_user, personal_user_no_trial, shared_source_link
):
    await as_user(personal_user_no_trial).get(
        f"/links/addlink?id={shared_source_link['share_token']}"
    )
    copy = await motor_db.links.find_one({
        "username": personal_user_no_trial["username"],
        "share_id": shared_source_link["id"],
    })
    assert copy is not None
    assert copy["slug"] != shared_source_link["slug"]
    assert copy["share_token"] != shared_source_link["share_token"]


async def test_the_source_link_is_still_resolvable_by_its_own_token(
    as_user, personal_user_no_trial, shared_source_link
):
    """A duplicated share_token made the /addlink lookup ambiguous."""
    await as_user(personal_user_no_trial).get(
        f"/links/addlink?id={shared_source_link['share_token']}"
    )
    matches = await motor_db.links.count_documents(
        {"share_token": shared_source_link["share_token"]}
    )
    assert matches == 1
