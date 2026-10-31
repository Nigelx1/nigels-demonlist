"""
Insane swaps: what a swapped demon is placed and scored at.

A head mod who has a 100% on two rated Insane Demons on the list can swap them
(SITE.insaneSwaps; Nigel and Dihmaster500, 2026-10-31): each takes the other's
place and points. tools/apply-edit.py swap_insanes exchanges the two demons'
stored positions and gives both the same `swapGroup` number in data/demons.js;
a later swap that involves a member of a group joins that group.

The rule, for each group with at least 2 demons on the list: put every member's
own value (its base - the AREDL fit for a demon the AREDL places, else its GD
Demon Ladder rating, else its tier's typical rating: DL.baseRating) in one pot,
highest first, and hand the pot out to the members in their stored order, the
highest value to the member highest on the list. So the stored order IS the
head mods' decision: a re-sort keeps the members where they are relative to each
other and sorts everyone else around them, a GDDL or AREDL change to a member
only changes what the group hands out, and the set of values on the list never
changes. Swapping a pair back puts the group in its own order again (every
member gets its own value), and apply-edit.py then drops its swapGroup.

Ties: values tie when they're equal to 2 decimals, like every sort key, and
swap_insanes refuses to swap a tied pair. Members can still come to a tie later
(an AREDL placement or a GDDL rating drifting), and a tie mustn't undo the head
mods' order: the usual tie-break, AREDL placement first, would put a member the
AREDL places (in canon, say) above a tied member they put above it, and from
then on the group would hand its values out in that order. So inside a swap the
sort keys skip the AREDL tie-break (members(): 10^9 instead of the placement,
as for a demon the AREDL doesn't place), and the stored order decides - the
current position in refresh-order.py and Engine.swap_left, the stable sort over
the stored order in add-records.py, and views.js's key the same way.

One rounding-level effect is left as it is: the list is only in order to 2
decimals, so a merge of two groups (a swap across them) that meets a tie can
hand two members a value from the other side of that tie - a shift under 0.01
for those two, never a change of place.

The same rule is written for the site in static/js/list-utils.js
(DL.demonRating, DL.swapGroupOf) - change both together. Used by add-records.py
and refresh-order.py (their sort keys) and apply-edit.py (rating_value, the swap
op, remove_record). Each loads this file by its path, like tools/gdlevel.py, so it
works from a tool run as a script and from one apply-edit.py imports. No
third-party modules. A list with no swapGroup anywhere (Nigel's Demonlist) gets
{} from effective_values and an empty members(), so every caller sorts exactly
as before.
"""


def group_id(d):
    """A demon's swapGroup when it's a number (it's in a group), else None."""
    g = d.get("swapGroup")
    return g if isinstance(g, (int, float)) and not isinstance(g, bool) else None


def groups(demons):
    """{swapGroup: [its members, top of the list first]} for every group with at
    least 2 members among demons (the listed demons, with their positions). A
    group down to one member does nothing."""
    out = {}
    for d in demons:
        g = group_id(d)
        if g is not None:
            out.setdefault(g, []).append(d)
    return {g: sorted(ms, key=lambda d: d["position"]) for g, ms in out.items() if len(ms) >= 2}


def members(demons):
    """The level ids of every demon in a swap group with at least 2 demons among
    demons (the listed demons): the ones whose place a swap holds, so their sort
    keys skip the AREDL tie-break (see Ties above)."""
    return {d["levelId"] for ms in groups(demons).values() for d in ms}


def effective_values(demons, base):
    """{levelId: value} for the members of every swap group among demons (the
    listed demons, with their stored positions): the members' base values (base,
    a function of a demon), highest first, handed out in position order. A demon
    that's absent isn't swapped: its value is its own base."""
    out = {}
    for members in groups(demons).values():
        for d, v in zip(members, sorted((base(d) for d in members), reverse=True)):
            out[d["levelId"]] = v
    return out
