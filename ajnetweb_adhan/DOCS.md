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

Event `ajnetweb_adhan_played` (`prayer`, `manual`, `speakers`) fires after each adhan — use it for
automations such as dimming lights or closing curtains at Maghrib.

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
