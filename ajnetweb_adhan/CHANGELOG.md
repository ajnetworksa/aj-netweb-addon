# Changelog - AJ Netweb Prayer & Adhan

## 1.4.1 - adhan no longer repeats on looping speakers
- **Fix: the adhan started again when it finished** on speakers that are neither Music Assistant nor "announce"
  speakers (DLNA renderers such as the wall panels' own players, many TVs): those were sent the file and then left
  alone, so a player in repeat/loop mode played it over and over. Now repeat is switched off before the adhan, the
  player is stopped once the file is over (up to 15 s extra for slow players; a player that already started
  something else is not touched; DLNA players that report the file URL decoded or rewritten are still recognised),
  and the old repeat setting is put back.
- **Fix: "AJ Netweb Adhan play now" no longer presses itself when Home Assistant restarts** (the restored button
  state was taken as a press). Only real presses play the adhan; the same for *stop*.

## 1.4.0 - iqamah, Jumu'ah, per-prayer speakers, Quran after Fajr
- **Iqamah:** minutes after each adhan (Prayers tab). A phone reminder a few minutes before (5 by default) and an
  optional short iqamah audio on that prayer's speakers. Iqamah times are in `sensor.ajnetweb_next_prayer`
  (attribute `iqamah`).
- **Speakers per prayer:** a prayer can use its own speakers (e.g. only the majlis for Fajr); "Default" keeps the
  Speakers tab.
- **Friday:** Dhuhr is called Jumu'ah on Fridays; choose whether the adhan plays at home, a separate Jumu'ah
  audio, a phone reminder before Jumu'ah, and a Surat Al-Kahf reminder on Friday morning.
- **Quran after Fajr:** a recitation file or a Quran radio stream starts on the speakers after the Fajr adhan
  (and dua) as normal playback; *Play now* to try it.
- New tab *Iqamah · Friday · Quran*. Uploads up to 60 MB (recitations).

## 1.3.0 - AC pre-cooling before prayers
- **New tab "AC pre-cooling":** start chosen ACs a set time before a prayer, e.g. cool the majlis to 22° 30 minutes
  before Maghrib. Each rule picks its prayers, minutes before, ACs, mode and a summer temperature; a winter
  temperature is optional (without one the rule rests in winter). Summer months are set once (April–October by
  default). Options: only when someone is home, only in Ramadan (cool the majlis before iftar).
- The family's choices win: an AC that is already set cooler, or running as fan or dry, is left alone.
- New helper `input_boolean.aj_netweb_precool` switches all pre-cooling on or off (dashboard, voice, automations).
  Event `ajnetweb_precool_started` after each run; runs show in History. *Run now* tries a rule straight away.

## 1.2.0
- The page follows the person's AJ Netweb dashboard appearance (theme, colour, wallpaper), like every
  AJ Netweb add-on. Opened outside Home Assistant it keeps its own look.

## 1.1.1
- Licence page: only asks for something when something is needed. With licensing not switched on, or when
  licensed through AJ Netweb Remote Access, it just shows the status (no licence key box or Activate button).

## 1.1.0
- **AJ Netweb licence:** this add-on now needs this Home Assistant to be licensed by AJ Netweb, normally
  through **AJ Netweb Remote Access** (no key to enter), or with an offline licence key (see `licensing/README.md`). Existing installations keep
  working for 14 days after updating; the add-on page shows the Install ID and an Activate box.
  Developer builds without a public key are not affected.

## 1.0.0
- First release: adhan at prayer times from the native Islamic Prayer Times integration, one-click
  setup with Umm Al-Qura or 20+ methods, Music Assistant / announce / standard speakers, TV pause and
  resume, Fajr adhan and dua files, per-prayer offset and volume, phone reminders, Ramadan suhoor
  reminder, Hijri date, dashboard helpers and `sensor.ajnetweb_next_prayer`.
