# AJ Netweb Prayer & Adhan

## Set up (5 minutes)

1. Settings → System → General: check the home **location** and **time zone** (prayer times use them).
2. Open **Prayer & Adhan** in the sidebar → **Setup** → pick the calculation method
   (*Umm Al-Qura, Makkah* for KSA) → **Set up / update prayer times**. This adds Home Assistant's
   Islamic Prayer Times integration for you.
3. **Audio** → upload your adhan recording(s) (mp3/m4a/ogg/wav). Choose the main adhan and,
   optionally, a different Fajr adhan and a dua after the adhan.
   Only use recordings you have the right to use.
4. **Speakers** → tick the speakers that should play the adhan; tick **Pause** for TVs.
5. **Today** → **Test adhan**.

## How each speaker type is handled

| Speaker | Method | What happens to music |
|---|---|---|
| Music Assistant player | `music_assistant.play_announcement` | Paused and resumed by Music Assistant |
| Sonos, Google Cast and others with *announce* | `media_player.play_media` with `announce: true` | Ducked/resumed by the integration |
| Other media players | volume set → `play_media` → volume restored | Music is replaced (not resumed) |
| TVs in "Pause" | `media_pause` before, `media_play` after | Resumed |

Audio files live in `/config/www/ajnetweb_adhan/` and are served by Home Assistant at
`/local/ajnetweb_adhan/…` so the speakers can fetch them. Home Assistant's *internal URL*
(Settings → System → Network) is used when set, otherwise the host's LAN IP.

## Entities created

| Entity | Use |
|---|---|
| `sensor.ajnetweb_next_prayer` | State = next prayer; attributes: `next_time`, `times`, `hijri`, `ramadan`, `playing` |
| `input_boolean.aj_netweb_adhan` | Master on/off (dashboard, voice, automations) |
| `input_boolean.aj_netweb_adhan_mute_next` | Skip only the next adhan (turns itself off) |
| `input_button.aj_netweb_adhan_play_now` | Play the adhan now |
| `input_button.aj_netweb_adhan_stop` | Stop playback |
| `input_boolean.aj_netweb_precool` | AC pre-cooling on/off |

Event `ajnetweb_adhan_played` (`prayer`, `manual`, `speakers`) fires after each adhan — use it for
automations such as dimming lights or closing curtains at Maghrib.

## Iqamah, Friday and Quran after Fajr

- **Iqamah:** in the Prayers tab set the minutes after each adhan. Phones get a reminder shortly before
  (tab *Iqamah · Friday · Quran*), and an optional short iqamah audio plays on that prayer's speakers.
- **Speakers per prayer:** the *Speakers* column in the Prayers tab; leave it on *Default* to use the Speakers tab.
- **Friday:** choose whether the adhan plays at home for Jumu'ah, a separate audio, a reminder before
  Jumu'ah (e.g. 45 minutes, time to leave for the mosque) and a Surat Al-Kahf reminder.
- **Quran after Fajr:** pick an uploaded recitation or paste a Quran radio stream URL. It starts after the adhan
  and dua have finished, as normal playback (stop it from the speaker or the dashboard).

## AC pre-cooling

**AC pre-cooling** tab → *Add pre-cooling*: choose the prayers, how many minutes before, the ACs and the
temperature. Example: *Majlis before Maghrib*, 30 minutes, majlis AC, cool 22°, only in Ramadan.

- **Seasons:** tick the summer months once. In the other months a rule uses its winter temperature, or does
  nothing if that is blank.
- **The family stays in charge:** an AC already set cooler than the rule, or running as fan or dry, is not
  touched. Pre-cooling only starts the AC; it never switches one off.
- Works even when the adhan itself is switched off. `input_boolean.aj_netweb_precool` turns all of it off.
- Every run (and every skip, with the reason) is listed in **History**.

## Dashboard

The AJ Netweb dashboard shows a prayer card on Home and on the Wall Panel automatically when
prayer times exist. In other dashboards add:

```yaml
type: custom:ajnetweb-prayer-card
```

## Notes

- Times update daily from the integration; offsets (minutes) let you match the local mosque.
- *Hijri date adjustment* shifts the date ±2 days for local moon sighting.
- *Only when someone is home* uses `person.*` entities.
- The older *Adhan & Smart Media Mute* blueprint in Dashboard Suite is replaced by this add-on.

## Licence

This add-on works only on a Home Assistant activated by AJ Netweb. Normally there is nothing to do here:
when **AJ Netweb Remote Access** is activated on this Home Assistant, it licenses every AJ Netweb add-on
automatically. Sites without Remote Access: open the add-on (or Dashboard Studio → Licence), copy the
**Install ID**, send it to AJ Netweb and paste the licence key you receive. Without either, the add-on runs
for 14 days, then shows the activation screen only.
