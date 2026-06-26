import nh3
import mistune
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_confirmed_user, get_current_user
from app.database import motor_db
from app.models.user import (
    UpdateTimezoneRequest, AddNumberRequest, TutorialRequest,
    SortRequest, OpenEarlyRequest, NoteRequest, AutoDeleteRequest, VacationModeRequest,
)

router = APIRouter(prefix="/users", tags=["users"])

_ALLOWED_TAGS = {
    "p", "b", "i", "em", "strong", "a", "ul", "ol", "li",
    "code", "pre", "blockquote", "h1", "h2", "h3",
}


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    user.pop("_id", None)
    user.pop("password", None)
    user.pop("_jti", None)
    user.pop("_exp", None)
    return user


@router.patch("/timezone")
async def update_timezone(body: UpdateTimezoneRequest, user: dict = Depends(get_confirmed_user)):
    update: dict = {"timezone": body.timezone}
    if body.offset is not None:
        update["offset"] = body.offset
    await motor_db.login.update_one({"username": user["username"]}, {"$set": update})
    return {"message": "Updated"}


@router.patch("/offset")
async def set_offset(body: dict, user: dict = Depends(get_confirmed_user)):
    offset = body.get("offset")
    if offset is None:
        raise HTTPException(status_code=422, detail="offset required")
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"offset": offset}})
    return {"message": "Updated"}


@router.patch("/daylight-savings")
async def daylight_savings(body: dict, user: dict = Depends(get_confirmed_user)):
    shift = int(body.get("shift", 0))
    days_to_nums = {"Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6}
    nums_to_days = {v: k for k, v in days_to_nums.items()}

    async for link in motor_db.links.find({"username": user["username"]}):
        try:
            parts = link["time"].split(":")
            hour = int(parts[0]) - shift
            minute = int(parts[1])
        except (IndexError, ValueError, KeyError):
            continue
        days = list(link.get("days", []))
        if hour < 0:
            hour += 24
            days = [nums_to_days[(days_to_nums[d] - 1) % 7] for d in days]
        elif hour >= 24:
            hour -= 24
            days = [nums_to_days[(days_to_nums[d] + 1) % 7] for d in days]
        time_str = f"{hour}:{str(minute).zfill(2)}"
        await motor_db.links.update_one(
            {"username": user["username"], "id": link["id"]},
            {"$set": {"time": time_str, "days": days}},
        )
    return {"message": "Updated"}


@router.patch("/number")
async def add_number(body: AddNumberRequest, user: dict = Depends(get_confirmed_user)):
    digits = "".join(c for c in body.number if c.isdigit())
    if not digits:
        raise HTTPException(status_code=422, detail="Invalid phone number")
    if len(digits) < 11:
        digits = body.countrycode.lstrip("+") + digits
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"number": int(digits)}})
    return {"message": "Updated"}


@router.patch("/sort")
async def sort_links(body: SortRequest, user: dict = Depends(get_confirmed_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"sort": body.sort}})
    return {"message": "Updated"}


@router.patch("/open-early")
async def open_early(body: OpenEarlyRequest, user: dict = Depends(get_confirmed_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"open_early": body.open}})
    return {"message": "Updated"}


@router.patch("/auto-delete")
async def set_auto_delete(body: AutoDeleteRequest, user: dict = Depends(get_confirmed_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"auto_delete_past": body.enabled}})
    return {"message": "Updated"}


@router.patch("/vacation-mode")
async def set_vacation_mode(body: VacationModeRequest, user: dict = Depends(get_confirmed_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"vacation_mode": body.enabled}})
    return {"message": "Updated"}


@router.patch("/show-calendar")
async def set_show_calendar(body: dict, user: dict = Depends(get_confirmed_user)):
    enabled = body.get("enabled", False)
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"show_calendar": enabled}})
    return {"message": "Updated"}


@router.patch("/popup-check")
async def popup_check(user: dict = Depends(get_current_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"popup_check_done": True}})
    return {"message": "Updated"}


@router.patch("/tutorial")
async def tutorial(body: TutorialRequest, user: dict = Depends(get_confirmed_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"tutorial": body.step}})
    return {"message": "Updated"}


@router.patch("/tutorial-widget")
async def tutorial_widget(body: dict, user: dict = Depends(get_confirmed_user)):
    finished = body.get("finished", False)
    value = "complete" if finished else "incomplete"
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"tutorialWidget": value}})
    return {"message": "Updated"}


@router.get("/notes")
async def get_notes(user: dict = Depends(get_confirmed_user)):
    doc = await motor_db.login.find_one({"username": user["username"]})
    return list((doc or {}).get("notes", {}).values())


@router.post("/notes")
async def save_note(body: NoteRequest, user: dict = Depends(get_confirmed_user)):
    doc = await motor_db.login.find_one({"username": user["username"]})
    notes = (doc or {}).get("notes", {})
    notes[str(body.id)] = {"id": body.id, "name": body.name, "markdown": body.markdown, "date": body.date}
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"notes": notes}})
    return notes


@router.patch("/whats-new-seen")
async def mark_whats_new_seen(user: dict = Depends(get_current_user)):
    await motor_db.login.update_one(
        {"username": user["username"]},
        {"$set": {"whats_new_seen": "v2"}},
    )
    return {"message": "Updated"}


@router.post("/markdown")
async def markdown_to_html(body: dict, user: dict = Depends(get_confirmed_user)):
    md = body.get("markdown", "")
    raw_html = mistune.html(md)
    safe_html = nh3.clean(raw_html, tags=_ALLOWED_TAGS)
    return {"html": safe_html}


@router.delete("/me")
async def delete_account(user: dict = Depends(get_current_user)):
    email = user["username"]
    await motor_db.links.delete_many({"username": email})
    await motor_db.bookmarks.delete_many({"username": email})
    await motor_db.deleted_links.delete_many({"username": email})
    await motor_db.deleted_bookmarks.delete_many({"username": email})
    await motor_db.pending_links.delete_many({"username": email})
    await motor_db.pending_bookmarks.delete_many({"username": email})
    await motor_db.login.delete_one({"username": email})
    return {"message": "Account deleted"}
