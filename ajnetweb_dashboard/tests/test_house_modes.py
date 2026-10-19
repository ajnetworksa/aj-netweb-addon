"""House modes: plan (what is written to HA) and apply (in which order, with a fake HA).

Run from the repository root:  python3 -m unittest discover -s ajnetweb_dashboard/tests
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import house_modes as hm  # noqa: E402


def ent(eid, group, area="living"):
    return {"entity_id": eid, "domain": eid.split(".")[0], "group": group, "area_id": area, "name": eid}


MODEL = {"areas": [
    {"id": "living", "lights": [ent("light.ceiling", "lights"), ent("switch.spot_light", "lights"), ent("light.aquarium", "lights")],
     "climates": [ent("climate.living_ac", "climates"), ent("water_heater.boiler", "climates")],
     "covers": [ent("cover.curtain", "covers")], "access": [ent("cover.main_gate", "access")],
     "media": [ent("media_player.tv", "media")], "alarms": [ent("alarm_control_panel.home", "alarms")],
     "scenes": [ent("scene.welcome", "scenes")]},
]}


class FakeSession:
    def __init__(self, ha):
        self.ha = ha

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def call(self, cmd, **kw):
        self.ha.calls.append((cmd, kw))
        if cmd == "input_select/list":
            return self.ha.helpers
        if cmd == "input_select/create":
            self.ha.helpers.append({"id": "ajnetweb_house_mode"})
            return {"id": "ajnetweb_house_mode"}
        if cmd == "config/label_registry/list":
            return self.ha.labels
        if cmd == "config/label_registry/create":
            lab = {"label_id": "alexa", "name": kw["name"]}
            self.ha.labels.append(lab)
            return lab
        return {}

    def try_call(self, cmd, default=None, **kw):
        self.ha.calls.append((cmd, kw))
        if cmd == "config/entity_registry/get":
            return {"entity_id": kw["entity_id"], "labels": ["family"]}
        return default


class FakeClient:
    connected = True

    def __init__(self, states=None, bridge=True):
        self.calls, self.rests, self.helpers, self.labels = [], [], [], []
        self.states = states or []
        self.bridge = bridge

    def session(self):
        return FakeSession(self)

    def rest(self, method, path, body=None):
        self.rests.append((method, path, body))
        return 200, {"result": "ok"}

    def rest_get(self, path, default=None):
        if path == "/core/api/states":
            return self.states
        if path.endswith("/info"):
            return {"options": {"auto_expose_label": "alexa"}}
        return default

    def find_addon_panel(self, slug):
        return "/abc123_alexa_matter_bridge" if self.bridge else None


class PlanTests(unittest.TestCase):
    def test_defaults_are_off_and_complete(self):
        cfg = hm.merge_defaults(None)
        self.assertFalse(cfg["enabled"])
        self.assertEqual(hm.enabled_modes(cfg), ["home", "away", "night"])
        self.assertIsNone(hm.strategy_option(cfg))

    def test_bad_values_fall_back(self):
        cfg = hm.clean({"enabled": 1, "modes": {"away": {"lights": "explode", "scene": "light.x", "name": " Out "}},
                        "keep_on": ["light.ok", "not an id", 5]})
        self.assertEqual(cfg["modes"]["away"]["lights"], "off")
        self.assertNotIn("scene", cfg["modes"]["away"])
        self.assertEqual(cfg["modes"]["away"]["name"], "Out")
        self.assertEqual(cfg["keep_on"], ["light.ok"])

    def test_away_actions(self):
        cfg = hm.merge_defaults({"enabled": True, "keep_on": ["light.aquarium"],
                                 "modes": {"away": {"scene": "scene.welcome"}}})
        p = hm.plan(cfg, MODEL)
        away = next(c for c in p["automation"]["actions"][0]["choose"] if c["conditions"][0]["id"] == "away")
        by_action = {s["action"]: s["target"]["entity_id"] for s in away["sequence"]}
        self.assertEqual(by_action["homeassistant.turn_off"], ["light.ceiling", "switch.spot_light"])   # aquarium kept
        self.assertEqual(by_action["climate.turn_off"], ["climate.living_ac"])                        # not the boiler
        self.assertEqual(by_action["cover.close_cover"], ["cover.curtain"])                            # never the gate
        self.assertEqual(by_action["alarm_control_panel.alarm_arm_away"], ["alarm_control_panel.home"])
        self.assertEqual(by_action["scene.turn_on"], ["scene.welcome"])
        self.assertTrue(all(s["continue_on_error"] for s in away["sequence"]))

    def test_home_does_nothing_by_default_and_restart_is_ignored(self):
        cfg = hm.merge_defaults({"enabled": True})
        p = hm.plan(cfg, MODEL)
        ids = [c["conditions"][0]["id"] for c in p["automation"]["actions"][0]["choose"]]
        self.assertEqual(ids, ["away", "night"])
        self.assertIn("from_state is not none", p["automation"]["conditions"][0]["value_template"])
        self.assertEqual(sorted(p["scripts"]), ["ajnetweb_mode_away", "ajnetweb_mode_home", "ajnetweb_mode_night"])
        self.assertEqual(p["scripts"]["ajnetweb_mode_away"]["alias"], "Away mode")

    def test_strategy_option(self):
        cfg = hm.merge_defaults({"enabled": True, "modes": {"night": {"name": "Sleep"}}})
        self.assertEqual(hm.strategy_option(cfg), {"entity": "input_select.ajnetweb_house_mode",
                                                   "names": {"night": "Sleep"}, "confirm": ["away", "night"]})


class ApplyTests(unittest.TestCase):
    def test_apply_creates_everything_and_labels_for_alexa(self):
        old = [{"entity_id": "script.ajnetweb_mode_guests"}, {"entity_id": "script.other"}]
        client = FakeClient(states=old)
        res = hm.apply(client, hm.merge_defaults({"enabled": True}), MODEL)
        self.assertTrue(res["ok"], res)
        cmds = [c for c, _ in client.calls]
        self.assertEqual(cmds[:3], ["input_select/list", "input_select/create", "input_select/update"])
        update = dict(client.calls[2][1])
        self.assertEqual(update["name"], "House mode")
        self.assertEqual(update["options"], ["home", "away", "night"])
        posted = [p for m, p, _ in client.rests if m == "POST"]
        self.assertIn("/core/api/config/script/config/ajnetweb_mode_away", posted)
        self.assertIn("/core/api/config/automation/config/ajnetweb_house_modes", posted)
        deleted = [p for m, p, _ in client.rests if m == "DELETE"]
        self.assertEqual(deleted, ["/core/api/config/script/config/ajnetweb_mode_guests"])   # guests is off; "other" untouched
        labelled = [kw for c, kw in client.calls if c == "config/entity_registry/update"]
        self.assertEqual(len(labelled), 3)
        self.assertEqual(labelled[0]["labels"], ["family", "alexa"])   # existing labels kept

    def test_existing_helper_is_updated_not_recreated(self):
        client = FakeClient()
        client.helpers.append({"id": "ajnetweb_house_mode"})
        hm.apply(client, hm.merge_defaults({"enabled": True, "alexa": False}), MODEL)
        cmds = [c for c, _ in client.calls]
        self.assertNotIn("input_select/create", cmds)
        self.assertNotIn("config/entity_registry/update", cmds)

    def test_disabled_touches_nothing(self):
        client = FakeClient()
        hm.apply(client, hm.merge_defaults({"enabled": False}), MODEL)
        self.assertEqual(client.calls, [])
        self.assertEqual(client.rests, [])


if __name__ == "__main__":
    unittest.main()
