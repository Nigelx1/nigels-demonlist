"use strict";
// -----------------------------------------------------------------------------
// Real data for Nigel, Juice, Jack, xPapita, and jd. Levels/records sourced
// from GD Demon Ladder (gdladder.com) on 2026-09-01 - see the comment this
// replaced (in your editor's history / git, if you keep one) for exact URLs.
// Level descriptions are the real in-game descriptions, pulled from gdbrowser
// (gdbrowser.com/api/level/<id>) on 2026-09-01. RobTop's three official
// levels (Clubstep, Theory of Everything 2, Deadlocked) aren't served by
// that API (they ship with the game client, not the level server), so their
// description is null rather than guessed.
//
// publisher/creators = the level's real GD creator. 'verifier' is
// repurposed to mean "who of us cleared it first": Nigel wins any tie,
// else Juice (per instructions). Several levels have more than one of us on
// them for that reason.
//
// nationality/subdivision: Nigel = US/IL (Illinois), Juice = US/IN
// (Indiana), Jack = US/CA (California), ufplayer = MX (Mexico), the rest =
// US with no subdivision.
//
// position is ranked by gdladder's own difficulty *rating* (the number,
// hardest first) - re-sort the whole array by `rating` and renumber when a
// demon is added. `difficulty` is gdladder's categorical tier: "Easy" |
// "Medium" | "Hard" | "Insane" | "Extreme" | "Official" (RobTop's three).
//
// videoUrl / thumbnailUrl: the level's GDDL "Showcase" video (gdladder.com
// /api/levels/<id> -> .Showcase, a YouTube id) and that video's YouTube still
// (maxresdefault, else hqdefault). If a future level has no showcase, leave
// thumbnailUrl null and the panel falls back to a difficulty-coloured card.
//
// `gd`: extra level facts for the demon page's #level-info panel, scraped from
// gdbrowser (/api/level/<id>) on 2026-09-01 - { length, objects?, gameVersion,
// inGameDifficulty, song: { id, name, artist, link? } }. Absent for the 3
// official levels. objects is omitted when gdbrowser returns 0 (its cap is
// 65535, shown as "65535+"). song with a non-numeric id (RobTop soundtrack) is
// not rendered, matching pointercrate.
// -----------------------------------------------------------------------------

window.DEMONS = [
  {
    "id": 111751101,
    "position": 1,
    "name": "Ghoul",
    "difficulty": "Extreme",
    "rating": 30.61,
    "publisher": "XavT",
    "creators": [
      "XavT"
    ],
    "verifier": "Juice",
    "videoUrl": "https://www.youtube.com/watch?v=Gs_nUtJ-tLs",
    "thumbnailUrl": "https://i.ytimg.com/vi/Gs_nUtJ-tLs/maxresdefault.jpg",
    "levelId": 111751101,
    "description": "(No description provided)",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Juice",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IN"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Extreme Demon",
      "song": {
        "id": "10007166",
        "name": "GHOUL",
        "artist": "Camellia",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": 347
  },
  {
    "id": 78248443,
    "position": 2,
    "name": "Worse Trip",
    "difficulty": "Extreme",
    "rating": 26.17,
    "publisher": "Loltad",
    "creators": [
      "Loltad"
    ],
    "verifier": "ufplayer",
    "videoUrl": "https://www.youtube.com/watch?v=ZWuWDLn3Os4",
    "thumbnailUrl": "https://i.ytimg.com/vi/ZWuWDLn3Os4/maxresdefault.jpg",
    "levelId": 78248443,
    "description": "the squeakquel",
    "requirementPercent": 100,
    "records": [
      {
        "player": "ufplayer",
        "progress": 100,
        "nationality": "MX",
        "subdivision": null
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 44672,
      "gameVersion": "2.2",
      "inGameDifficulty": "Extreme Demon",
      "song": {
        "id": "905109",
        "name": "Creo - Ballistic Funk",
        "artist": "CreoMusic"
      },
      "songOfficial": false
    },
    "aredlPosition": 643
  },
  {
    "id": 10565740,
    "position": 3,
    "name": "Bloodbath",
    "difficulty": "Extreme",
    "rating": 23.97,
    "publisher": "Riot",
    "creators": [
      "Riot"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=shOO9UfDvfs",
    "thumbnailUrl": "https://i.ytimg.com/vi/shOO9UfDvfs/maxresdefault.jpg",
    "levelId": 10565740,
    "description": "Whose blood will be spilt in the Bloodbath? Who will the victors be? How many will survive? Good luck...",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 24746,
      "gameVersion": "2.1",
      "inGameDifficulty": "Extreme Demon",
      "song": {
        "id": "467339",
        "name": "At the Speed of Light",
        "artist": "Dimrain47",
        "link": "https://geometrydashcontent.b-cdn.net/songs/467339.mp3"
      },
      "songOfficial": false
    },
    "aredlPosition": 845
  },
  {
    "id": 93752979,
    "position": 4,
    "name": "cytokinesis",
    "difficulty": "Extreme",
    "rating": 23.88,
    "publisher": "cherryteam",
    "creators": [
      "cherryteam"
    ],
    "verifier": "Juice",
    "videoUrl": "https://www.youtube.com/watch?v=fIlZb48Yyhs",
    "thumbnailUrl": "https://i.ytimg.com/vi/fIlZb48Yyhs/maxresdefault.jpg",
    "levelId": 93752979,
    "description": "the OTHERS awaken our becoming | hosted by sauzzeth",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Juice",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IN"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Extreme Demon",
      "song": {
        "id": "1229116",
        "name": "CYTOKINESIS / SFX /",
        "artist": "Albee",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": 934
  },
  {
    "id": 89976481,
    "position": 5,
    "name": "court circuit",
    "difficulty": "Extreme",
    "rating": 22.67,
    "publisher": "Fafenel",
    "creators": [
      "Fafenel"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=PWHoCIrdY7o",
    "thumbnailUrl": "https://i.ytimg.com/vi/PWHoCIrdY7o/maxresdefault.jpg",
    "levelId": 89976481,
    "description": "Huge thanks to Aymen, Agar, DraxitIII, Litoks, Regnom, Nexo, Shadowhisky1374, Spatule and M435J for playtesting ! Verified by DraxitIII, update verified by LastPrismAlex !",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Extreme Demon",
      "song": {
        "id": "657081",
        "name": "Lit Fuse",
        "artist": "Cacola",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": 1122
  },
  {
    "id": 119653522,
    "position": 6,
    "name": "Steel Terrors",
    "difficulty": "Extreme",
    "rating": 21.52,
    "publisher": "DreamZoneGD",
    "creators": [
      "DreamZoneGD"
    ],
    "verifier": "ufplayer",
    "videoUrl": "https://www.youtube.com/watch?v=8hi2QZBEgUQ",
    "thumbnailUrl": "https://i.ytimg.com/vi/8hi2QZBEgUQ/maxresdefault.jpg",
    "levelId": 119653522,
    "description": "You cant crush steel, but steel can crush YOU",
    "requirementPercent": 100,
    "records": [
      {
        "player": "ufplayer",
        "progress": 100,
        "nationality": "MX",
        "subdivision": null
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Extreme Demon",
      "song": {
        "id": "580470",
        "name": "---Steel Terror---",
        "artist": "Acid-Notation",
        "link": "https://geometrydashcontent.b-cdn.net/songs/580470.mp3"
      },
      "songOfficial": false
    },
    "aredlPosition": 1215
  },
  {
    "id": 30219145,
    "position": 7,
    "name": "HyperSonic",
    "difficulty": "Extreme",
    "rating": 21,
    "publisher": "ViPriN",
    "creators": [
      "ViPriN"
    ],
    "verifier": "ufplayer",
    "videoUrl": "https://www.youtube.com/watch?v=yFwPswAfvqw",
    "thumbnailUrl": "https://i.ytimg.com/vi/yFwPswAfvqw/maxresdefault.jpg",
    "levelId": 30219145,
    "description": "Megacollab by Dudex, Serponge, Manix648, Vlacc, Rustam, nasgubb, ZenthicAlpha, me, PanMan, Evasium, Etzer & Terron. Verified by Combined",
    "requirementPercent": 100,
    "records": [
      {
        "player": "ufplayer",
        "progress": 100,
        "nationality": "MX",
        "subdivision": null
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Extreme Demon",
      "song": {
        "id": "684300",
        "name": "ColBreakz - 10000",
        "artist": "ColBreakz"
      },
      "songOfficial": false
    },
    "aredlPosition": 1380
  },
  {
    "id": 114933189,
    "position": 8,
    "name": "Through The Decay",
    "difficulty": "Extreme",
    "rating": 20.09,
    "publisher": "sparktwo",
    "creators": [
      "sparktwo"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=kMMMx14Ks_o",
    "thumbnailUrl": "https://i.ytimg.com/vi/kMMMx14Ks_o/maxresdefault.jpg",
    "levelId": 114933189,
    "description": "Insane/Extreme demon made in 2 hours. Inspired by Forest Temple and R3XX3R. Not affiliated with The Fog.",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 6739,
      "gameVersion": "2.2",
      "inGameDifficulty": "Extreme Demon",
      "song": {
        "id": "1236581",
        "name": "...and Yet It Goes Nowhere",
        "artist": "Llaappssee",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": 1592
  },
  {
    "id": 61137742,
    "position": 9,
    "name": "Leyak",
    "difficulty": "Insane",
    "rating": 18.14,
    "publisher": "EnZore",
    "creators": [
      "EnZore"
    ],
    "verifier": "Juice",
    "videoUrl": "https://www.youtube.com/watch?v=wfvs8qZbFQw",
    "thumbnailUrl": "https://i.ytimg.com/vi/wfvs8qZbFQw/maxresdefault.jpg",
    "levelId": 61137742,
    "description": "a Sorcerer who has ability to shape shift into a Demon and serve Rangda [Verified by BoldStep] [Layout by Marwec and ILRELL]",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Juice",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IN"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "845356",
        "name": "Helvetican - Bufu",
        "artist": "SixImpala",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 59948178,
    "position": 10,
    "name": "Bad Trip",
    "difficulty": "Insane",
    "rating": 17.92,
    "publisher": "Loltad",
    "creators": [
      "Loltad"
    ],
    "verifier": "ufplayer",
    "videoUrl": "https://www.youtube.com/watch?v=aMjvBXqTK-w",
    "thumbnailUrl": "https://i.ytimg.com/vi/aMjvBXqTK-w/sddefault.jpg",
    "levelId": 59948178,
    "description": "My one man megacollab. Not an impeccable level, but it is most definitely my best so far! First CP, love you all <3 Pass is 420420",
    "requirementPercent": 100,
    "records": [
      {
        "player": "ufplayer",
        "progress": 100,
        "nationality": "MX",
        "subdivision": null
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 46843,
      "gameVersion": "2.1",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "905108",
        "name": "Creo - Crazy",
        "artist": "CreoMusic"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 37259527,
    "position": 11,
    "name": "BuTiTi II",
    "difficulty": "Insane",
    "rating": 17.8,
    "publisher": "JonathanGD",
    "creators": [
      "JonathanGD"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=Fky82YxMrjo",
    "thumbnailUrl": "https://i.ytimg.com/vi/Fky82YxMrjo/maxresdefault.jpg",
    "levelId": 37259527,
    "description": "Welcome to the beautiful future! | WARNING! This level contains dankest memes and vaporwave. | Verified by mbed | Updated boss color",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "684652",
        "name": "Milkshake",
        "artist": "meganeko",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 126213470,
    "position": 12,
    "name": "Nilscapes",
    "difficulty": "Insane",
    "rating": 17.04,
    "publisher": "L413",
    "creators": [
      "L413"
    ],
    "verifier": "Jack",
    "videoUrl": "https://www.youtube.com/watch?v=zIbardyGrRk",
    "thumbnailUrl": "https://i.ytimg.com/vi/zIbardyGrRk/maxresdefault.jpg",
    "levelId": 126213470,
    "description": "ARE YOU SURE THIS LINE IS CLEAN",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Jack",
        "progress": 100,
        "nationality": "US",
        "subdivision": "CA"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 26278,
      "gameVersion": "2.2",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "1132447",
        "name": "Creo - Flow",
        "artist": "CreoMusic",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 32885972,
    "position": 13,
    "name": "Dark Travel",
    "difficulty": "Insane",
    "rating": 16.94,
    "publisher": "JonathanGD",
    "creators": [
      "JonathanGD"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=eV4ly1ayarw",
    "thumbnailUrl": "https://i.ytimg.com/vi/eV4ly1ayarw/maxresdefault.jpg",
    "levelId": 32885972,
    "description": "The darkness lingers. Be careful who you trust... | My first 2.1 level | Viprin CC8 Entry | 208k objects | Length: 6:14 | Password = 963041",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "693041",
        "name": "Dark Matter Suite (1f1n1ty + LOrbSheddy Remix)",
        "artist": "1f1n1ty",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 4706930,
    "position": 14,
    "name": "Supersonic",
    "difficulty": "Insane",
    "rating": 16.88,
    "publisher": "ZenthicAlpha",
    "creators": [
      "ZenthicAlpha"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=0G4CBc5Tq7c",
    "thumbnailUrl": "https://i.ytimg.com/vi/0G4CBc5Tq7c/maxresdefault.jpg",
    "levelId": 4706930,
    "description": "Megacollab by Glitter, Jeyzor, Sumsar, xcy-7, Daddepro, Evasium, Gboy, Viprin and me! Updated to add coins.",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      },
      {
        "player": "ufplayer",
        "progress": 100,
        "nationality": "MX",
        "subdivision": null
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "2.1",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "467267",
        "name": "Ludicrous Speed - F-777",
        "artist": "F-777",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 59858021,
    "position": 15,
    "name": "Dream Travel",
    "difficulty": "Insane",
    "rating": 16.78,
    "publisher": "SuprianGD",
    "creators": [
      "SuprianGD"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=-5YLPgXGr68",
    "thumbnailUrl": "https://i.ytimg.com/vi/-5YLPgXGr68/maxresdefault.jpg",
    "levelId": 59858021,
    "description": "Enjoy a new trip you dream of, different places and references| 5 months of creation|7:30 min| 294K Obj| 99!??| Verified: ItsAdvyStyles",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "793815",
        "name": "By Day By Night",
        "artist": "1f1n1ty",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 15122517,
    "position": 16,
    "name": "Lit Fuse",
    "difficulty": "Insane",
    "rating": 16.68,
    "publisher": "KrmaL",
    "creators": [
      "KrmaL"
    ],
    "verifier": "ufplayer",
    "videoUrl": "https://www.youtube.com/watch?v=7yhzE8k8Gbc",
    "thumbnailUrl": "https://i.ytimg.com/vi/7yhzE8k8Gbc/maxresdefault.jpg",
    "levelId": 15122517,
    "description": "My first completely solo, actually-intended-to-be-decent level. Enjoy :^) Update 3: Fixed bugs with higher refresh rates",
    "requirementPercent": 100,
    "records": [
      {
        "player": "ufplayer",
        "progress": 100,
        "nationality": "MX",
        "subdivision": null
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 28484,
      "gameVersion": "2.2",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "657081",
        "name": "Lit Fuse",
        "artist": "Cacola"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 87932531,
    "position": 17,
    "name": "Fool Moon Paranoid",
    "difficulty": "Insane",
    "rating": 16.08,
    "publisher": "unne",
    "creators": [
      "unne"
    ],
    "verifier": "ufplayer",
    "videoUrl": "https://www.youtube.com/watch?v=1bL9VGoRS98",
    "thumbnailUrl": "https://i.ytimg.com/vi/1bL9VGoRS98/maxresdefault.jpg",
    "levelId": 87932531,
    "description": "Maybe new style idk, rate dedmon 5*",
    "requirementPercent": 100,
    "records": [
      {
        "player": "ufplayer",
        "progress": 100,
        "nationality": "MX",
        "subdivision": null
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 61165,
      "gameVersion": "2.1",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "1054129",
        "name": "Space Telecom",
        "artist": "WaxTerk"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 7054561,
    "position": 18,
    "name": "Poltergeist",
    "difficulty": "Insane",
    "rating": 15.94,
    "publisher": "Andromeda GMD",
    "creators": [
      "Andromeda GMD"
    ],
    "verifier": "Jack",
    "videoUrl": "https://www.youtube.com/watch?v=Amyhrr_faUg",
    "thumbnailUrl": "https://i.ytimg.com/vi/Amyhrr_faUg/maxresdefault.jpg",
    "levelId": 7054561,
    "description": "Poltergeist by Andromeda",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Jack",
        "progress": 100,
        "nationality": "US",
        "subdivision": "CA"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 14871,
      "gameVersion": "2.1",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "587870",
        "name": "NK - Poltergeist (OLD mix)",
        "artist": "Rukkus",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 56568010,
    "position": 19,
    "name": "Magma Bound",
    "difficulty": "Insane",
    "rating": 15.77,
    "publisher": "ScorchVx",
    "creators": [
      "ScorchVx"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=Q_ZwRocfBy4",
    "thumbnailUrl": "https://i.ytimg.com/vi/Q_ZwRocfBy4/maxresdefault.jpg",
    "levelId": 56568010,
    "description": "This took WAAAY longer than it should've.... like the rest of my levels.... I put my heart and soul into this so I hope you guys enjoy :) ",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      },
      {
        "player": "Jack",
        "progress": 100,
        "nationality": "US",
        "subdivision": "CA"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "718171",
        "name": "cYsmix - Classic Pursuit",
        "artist": "cysmix",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 47620786,
    "position": 20,
    "name": "CraZy II",
    "difficulty": "Insane",
    "rating": 15.3,
    "publisher": "DavJT",
    "creators": [
      "DavJT"
    ],
    "verifier": "ufplayer",
    "videoUrl": "https://www.youtube.com/watch?v=I12UqR76CPk",
    "thumbnailUrl": "https://i.ytimg.com/vi/I12UqR76CPk/maxresdefault.jpg",
    "levelId": 47620786,
    "description": "#AdvyOUT",
    "requirementPercent": 100,
    "records": [
      {
        "player": "ufplayer",
        "progress": 100,
        "nationality": "MX",
        "subdivision": null
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "806733",
        "name": "Circus Contraption - Come To The Circus (DirtyPaws Remix)",
        "artist": "dirtypawsofficial",
        "link": "https://audio.ngfiles.com/806000/806733_Circus-Contraption---Come-.mp3?f1526820551"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 4545425,
    "position": 21,
    "name": "Stalemate",
    "difficulty": "Insane",
    "rating": 15.2,
    "publisher": "Nox",
    "creators": [
      "Nox"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=Bc2OwdU0p-Y",
    "thumbnailUrl": "https://i.ytimg.com/vi/Bc2OwdU0p-Y/maxresdefault.jpg",
    "levelId": 4545425,
    "description": "Wow. This was tough to beat. First level with this song though!",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "1.9",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "482872",
        "name": "KzX - Stalemate",
        "artist": "Kayoszx",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 43945511,
    "position": 22,
    "name": "Game Time",
    "difficulty": "Insane",
    "rating": 15.06,
    "publisher": "SimilarAMZ",
    "creators": [
      "SimilarAMZ"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=xd7NDbq8Q2k",
    "thumbnailUrl": "https://i.ytimg.com/vi/xd7NDbq8Q2k/maxresdefault.jpg",
    "levelId": 43945511,
    "description": "I finally finished this level! I used 79983objs and 999IDs...Pass is 643344,please enjoy!But I recommend doing practice mode.",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Insane Demon",
      "song": {
        "id": "284253",
        "name": "Blippblipp (modern 8bit)",
        "artist": "Bunnymajs",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 11402965,
    "position": 23,
    "name": "Forest Temple",
    "difficulty": "Hard",
    "rating": 13.95,
    "publisher": "Michigun",
    "creators": [
      "Michigun"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=L40Hhk0y78A",
    "thumbnailUrl": "https://i.ytimg.com/vi/L40Hhk0y78A/maxresdefault.jpg",
    "levelId": 11402965,
    "description": "You might get lost in the woods...",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "2.0",
      "inGameDifficulty": "Hard Demon",
      "song": {
        "id": "478283",
        "name": "-Haunted woods-",
        "artist": "Waterflame",
        "link": "http://audio.ngfiles.com/478000/478283_-Haunted-woods-.mp3"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 44062068,
    "position": 24,
    "name": "Future Funk",
    "difficulty": "Hard",
    "rating": 12.96,
    "publisher": "JonathanGD",
    "creators": [
      "JonathanGD"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=4hzPxTUbavo",
    "thumbnailUrl": "https://i.ytimg.com/vi/4hzPxTUbavo/maxresdefault.jpg",
    "levelId": 44062068,
    "description": "Remember when I said \"the future will be beautiful\"? Well, here it is again! A remake of Clutterfunk & High Life mixed into one awesomeness!",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      },
      {
        "player": "Jack",
        "progress": 100,
        "nationality": "US",
        "subdivision": "CA"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Hard Demon",
      "song": {
        "id": "701013",
        "name": "Whats a Future Funk?",
        "artist": "LemKuuja",
        "link": "https://geometrydashcontent.b-cdn.net/songs/701013.mp3"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 4284013,
    "position": 25,
    "name": "Nine Circles",
    "difficulty": "Hard",
    "rating": 11.15,
    "publisher": "Zobros",
    "creators": [
      "Zobros"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=dOdPoU1ncOc",
    "thumbnailUrl": "https://i.ytimg.com/vi/dOdPoU1ncOc/maxresdefault.jpg",
    "levelId": 4284013,
    "description": "Easy",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      },
      {
        "player": "jd",
        "progress": 100,
        "nationality": "US",
        "subdivision": null
      },
      {
        "player": "Jack",
        "progress": 100,
        "nationality": "US",
        "subdivision": "CA"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "2.0",
      "inGameDifficulty": "Hard Demon",
      "song": {
        "id": "533927",
        "name": "NK - Nine Circles",
        "artist": "Rukkus",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 104968496,
    "position": 26,
    "name": "Tidal Line",
    "difficulty": "Hard",
    "rating": 10.22,
    "publisher": "Sp4rce",
    "creators": [
      "Sp4rce"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=cfXQ1ZrKiNY",
    "thumbnailUrl": "https://i.ytimg.com/vi/cfXQ1ZrKiNY/maxresdefault.jpg",
    "levelId": 104968496,
    "description": "175k Obj solo level, a Dancing Line version of Tidal Wave! Original level built by OniLink & More. Tap to change direction! Verified by: NatikosOriginal",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Hard Demon",
      "song": {
        "id": "1298724",
        "name": "[TIDAL WAVE] Dion Timmer - Shiawase VIP (Vorlex Remix)",
        "artist": "Vorlexium",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 102343052,
    "position": 27,
    "name": "Space Invaders",
    "difficulty": "Hard",
    "rating": 10.18,
    "publisher": "DeeperSpace",
    "creators": [
      "DeeperSpace"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=mUNDM2q7u0s",
    "thumbnailUrl": "https://i.ytimg.com/vi/mUNDM2q7u0s/maxresdefault.jpg",
    "levelId": 102343052,
    "description": "Level 8 in Geometry Dash DeeperSpace (Created by Manix648 and LazerBlitz)",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Hard Demon",
      "song": {
        "id": "865364",
        "name": "Teminite & MDK - Space Invaders",
        "artist": "Teminite",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 92742742,
    "position": 28,
    "name": "tower descent",
    "difficulty": "Hard",
    "rating": 10.15,
    "publisher": "pocke",
    "creators": [
      "pocke"
    ],
    "verifier": "ufplayer",
    "videoUrl": "https://www.youtube.com/watch?v=WOzf3oVoD0c",
    "thumbnailUrl": "https://i.ytimg.com/vi/WOzf3oVoD0c/maxresdefault.jpg",
    "levelId": 92742742,
    "description": "for viprin mcc4 :) enjoy",
    "requirementPercent": 100,
    "records": [
      {
        "player": "ufplayer",
        "progress": 100,
        "nationality": "MX",
        "subdivision": null
      }
    ],
    "gd": {
      "length": "Medium",
      "objects": 60131,
      "gameVersion": "2.2",
      "inGameDifficulty": "Hard Demon",
      "song": {
        "id": "1163253",
        "name": "BUTT3RFLi3S >w<",
        "artist": "milkypossum",
        "link": "https://audio.ngfiles.com/1163000/1163253_BUTT3RFLi3S-gtwlt.mp3?f1665117424"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 96096712,
    "position": 29,
    "name": "Entropic Dreams",
    "difficulty": "Hard",
    "rating": 9.93,
    "publisher": "LepszyGD",
    "creators": [
      "LepszyGD"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=bX31mnC95x4",
    "thumbnailUrl": "https://i.ytimg.com/vi/bX31mnC95x4/maxresdefault.jpg",
    "levelId": 96096712,
    "description": "My first completed level, spend over 50hrs, it was a learning experience. GLHF Thanks ROB for my frist rate.",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Hard Demon",
      "song": {
        "id": "767005",
        "name": "-Cant Sleep-",
        "artist": "Waterflame",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 47611766,
    "position": 30,
    "name": "Biru",
    "difficulty": "Medium",
    "rating": 9.85,
    "publisher": "JonathanGD",
    "creators": [
      "JonathanGD"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=IHhftbiGHYg",
    "thumbnailUrl": "https://i.ytimg.com/vi/IHhftbiGHYg/maxresdefault.jpg",
    "levelId": 47611766,
    "description": "Full version is finally here! Big thanks to Viprin for giving me 1st place in Viprin's CC9 (unknown) | 116500 objects | 5 min 35 sec | OwO",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Medium Demon",
      "song": {
        "id": "772055",
        "name": "Aeolia",
        "artist": "1f1n1ty",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 25706351,
    "position": 31,
    "name": "HeLL",
    "difficulty": "Medium",
    "rating": 8.05,
    "publisher": "Serponge",
    "creators": [
      "Serponge"
    ],
    "verifier": "jd",
    "videoUrl": "https://www.youtube.com/watch?v=gTtsrzNUJM8",
    "thumbnailUrl": "https://i.ytimg.com/vi/gTtsrzNUJM8/maxresdefault.jpg",
    "levelId": 25706351,
    "description": "Trying a different style ! Shig made the gameplay, I made the design, hope you enjoy, rate demon ! ayy verified after 1 death at 92% ;3;",
    "requirementPercent": 100,
    "records": [
      {
        "player": "jd",
        "progress": 100,
        "nationality": "US",
        "subdivision": null
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "2.0",
      "inGameDifficulty": "Medium Demon",
      "song": {
        "id": "576177",
        "name": "---Accelerate---",
        "artist": "Acid-Notation",
        "link": "https://geometrydashcontent.b-cdn.net/songs/576177.mp3"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 69087510,
    "position": 32,
    "name": "evolutionary theory",
    "difficulty": "Medium",
    "rating": 7.84,
    "publisher": "MAYEROSA",
    "creators": [
      "MAYEROSA"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=yHTx3bJ0Lb0",
    "thumbnailUrl": "https://i.ytimg.com/vi/yHTx3bJ0Lb0/maxresdefault.jpg",
    "levelId": 69087510,
    "description": "In a scientific and historical perspective of the \"EVOLUTION\" of our existence and its possible future, I finally present my 5-minute masterpiece. I hope you like it.",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Medium Demon",
      "song": {
        "id": "109650",
        "name": "Operation: Evolution",
        "artist": "Dimrain47",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 40202837,
    "position": 33,
    "name": "Rising Down",
    "difficulty": "Medium",
    "rating": 6.94,
    "publisher": "Small",
    "creators": [
      "Small"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=tu5ZOPizlj8",
    "thumbnailUrl": "https://i.ytimg.com/vi/tu5ZOPizlj8/maxresdefault.jpg",
    "levelId": 40202837,
    "description": "For Krazyman50 =)",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 61098,
      "gameVersion": "2.1",
      "inGameDifficulty": "Medium Demon",
      "song": {
        "id": "683996",
        "name": "Time Leaper",
        "artist": "hinkik",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 118509879,
    "position": 34,
    "name": "Skeletal Shenanigans",
    "difficulty": "Medium",
    "rating": 6.66,
    "publisher": "YoReid",
    "creators": [
      "YoReid"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=x5D7z8DAD2s",
    "thumbnailUrl": "https://i.ytimg.com/vi/x5D7z8DAD2s/maxresdefault.jpg",
    "levelId": 118509879,
    "description": "TRAVELLER BEWARE, YOU'RE IN FOR A SCARE!",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      },
      {
        "player": "Jack",
        "progress": 100,
        "nationality": "US",
        "subdivision": "CA"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Medium Demon",
      "song": {
        "id": "1382827",
        "name": "Slash Inferno",
        "artist": "Teminite",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 61417747,
    "position": 35,
    "name": "potal",
    "difficulty": "Medium",
    "rating": 6.35,
    "publisher": "Sillow",
    "creators": [
      "Sillow"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=ILkOvJ8CrnM",
    "thumbnailUrl": "https://i.ytimg.com/vi/ILkOvJ8CrnM/maxresdefault.jpg",
    "levelId": 61417747,
    "description": "they are not your frends (ldm increases dark part brightness)",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 47915,
      "gameVersion": "2.1",
      "inGameDifficulty": "Medium Demon",
      "song": {
        "id": "Level 8",
        "name": "Time Machine",
        "artist": "Waterflame"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 17924880,
    "position": 36,
    "name": "Lonely travel",
    "difficulty": "Medium",
    "rating": 6.23,
    "publisher": "FunnyGame",
    "creators": [
      "FunnyGame"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=BuUJneALK1I",
    "thumbnailUrl": "https://i.ytimg.com/vi/BuUJneALK1I/maxresdefault.jpg",
    "levelId": 17924880,
    "description": "Useless longest level",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "gameVersion": "2.0",
      "inGameDifficulty": "Medium Demon",
      "song": {
        "id": "675124",
        "name": "The Undertakers Daughter instrumental",
        "artist": "steampianist",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 10972106,
    "position": 37,
    "name": "Solar Circles",
    "difficulty": "Medium",
    "rating": 5.92,
    "publisher": "D4rkGryf",
    "creators": [
      "D4rkGryf"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=zsdXcOydyAg",
    "thumbnailUrl": "https://i.ytimg.com/vi/zsdXcOydyAg/maxresdefault.jpg",
    "levelId": 10972106,
    "description": "ITS FINALLY HERE !!",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "1.9",
      "inGameDifficulty": "Medium Demon",
      "song": {
        "id": "493898",
        "name": "[J] - Solar Wind",
        "artist": "Jumper",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 34085027,
    "position": 38,
    "name": "B",
    "difficulty": "Medium",
    "rating": 5.81,
    "publisher": "motleyorc",
    "creators": [
      "motleyorc"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=lQNEDxtZdoI",
    "thumbnailUrl": "https://i.ytimg.com/vi/lQNEDxtZdoI/maxresdefault.jpg",
    "levelId": 34085027,
    "description": "Buzz Buzz, an incredible collab between me and ScorchVx, dedicated to Serponge, PanMan, and all of my wonderful viewers!",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Medium Demon",
      "song": {
        "id": "715825",
        "name": "Beep Beep",
        "artist": "Schtiffles",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 95683886,
    "position": 39,
    "name": "penguin industries",
    "difficulty": "Medium",
    "rating": 5.31,
    "publisher": "Unknown1276",
    "creators": [
      "Unknown1276"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=KygTJnyym7o",
    "thumbnailUrl": "https://i.ytimg.com/vi/KygTJnyym7o/hqdefault.jpg",
    "levelId": 95683886,
    "description": "small update, fixed some stuff around the second ball, mostly adding more spikes/adding hitboxes for certain structures.",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Medium",
      "objects": 32656,
      "gameVersion": "2.2",
      "inGameDifficulty": "Medium Demon",
      "song": {
        "id": "1209742",
        "name": "?? ??s???????? <loop>",
        "artist": "Xorberax",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 29619645,
    "position": 40,
    "name": "Zafari",
    "difficulty": "Easy",
    "rating": 4.92,
    "publisher": "Rustam",
    "creators": [
      "Rustam"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=jLJLJoyUvOg",
    "thumbnailUrl": "https://i.ytimg.com/vi/jLJLJoyUvOg/maxresdefault.jpg",
    "levelId": 29619645,
    "description": "17314 Objects! My first 2.1 Level hope you like it! I ran out of ideas at the end and I had so many projects to work on so I rushed it!",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 17314,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "685686",
        "name": "Africa calls",
        "artist": "EagleGuard"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 220369,
    "position": 41,
    "name": "Theory of Jumping",
    "difficulty": "Medium",
    "rating": 4.77,
    "publisher": "SpacePark",
    "creators": [
      "SpacePark"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=3qdHyNAoUs8",
    "thumbnailUrl": "https://i.ytimg.com/vi/3qdHyNAoUs8/maxresdefault.jpg",
    "levelId": 220369,
    "description": "Level 3",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "Pre-1.7",
      "inGameDifficulty": "Medium Demon",
      "song": {
        "id": "Level 12",
        "name": "Theory of Everything",
        "artist": "DJ-Nate"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 3,
    "position": 42,
    "name": "Deadlocked",
    "difficulty": "Official",
    "rating": 4.68,
    "publisher": "RobTop",
    "creators": [
      "RobTop"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=reZj2Xbt05Q",
    "thumbnailUrl": "https://i.ytimg.com/vi/reZj2Xbt05Q/maxresdefault.jpg",
    "levelId": 3,
    "description": null,
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      },
      {
        "player": "xPapita",
        "progress": 100,
        "nationality": "US",
        "subdivision": null
      },
      {
        "player": "Jack",
        "progress": 100,
        "nationality": "US",
        "subdivision": "CA"
      }
    ],
    "aredlPosition": null
  },
  {
    "id": 2997354,
    "position": 43,
    "name": "DeCode",
    "difficulty": "Easy",
    "rating": 4.11,
    "publisher": "Rek3dge",
    "creators": [
      "Rek3dge"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=IRTQZZ502J0",
    "thumbnailUrl": "https://i.ytimg.com/vi/IRTQZZ502J0/maxresdefault.jpg",
    "levelId": 2997354,
    "description": "(No description provided)",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      },
      {
        "player": "Jack",
        "progress": 100,
        "nationality": "US",
        "subdivision": "CA"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "2.0",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "587069",
        "name": "-Endgame-",
        "artist": "Waterflame",
        "link": "http://audio.ngfiles.com/587000/587069_-Endgame-.mp3"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 8660411,
    "position": 44,
    "name": "Death Moon",
    "difficulty": "Easy",
    "rating": 3.81,
    "publisher": "Caustic",
    "creators": [
      "Caustic"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=iN2leTih4DA",
    "thumbnailUrl": "https://i.ytimg.com/vi/iN2leTih4DA/maxresdefault.jpg",
    "levelId": 8660411,
    "description": "Song by SHK",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "gameVersion": "1.9",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "685746",
        "name": "Death Moon",
        "artist": "SoundHolicK",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 63277477,
    "position": 45,
    "name": "well being spot",
    "difficulty": "Easy",
    "rating": 3.62,
    "publisher": "2003devin",
    "creators": [
      "2003devin"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=fBoqFDfQkss",
    "thumbnailUrl": "https://i.ytimg.com/vi/fBoqFDfQkss/maxresdefault.jpg",
    "levelId": 63277477,
    "description": "i had a dream",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 31498,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "620959",
        "name": "-Stalker-",
        "artist": "Waterflame",
        "link": "http://audio.ngfiles.com/620000/620959_-Stalker-.mp3"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 111286661,
    "position": 46,
    "name": "MUNDUS SANGUINANS",
    "difficulty": "Easy",
    "rating": 3.23,
    "publisher": "1MadJack1",
    "creators": [
      "1MadJack1"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=yEHFPethK5w",
    "thumbnailUrl": "https://i.ytimg.com/vi/yEHFPethK5w/maxresdefault.jpg",
    "levelId": 111286661,
    "description": "Endure the bleeding world.",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "569938",
        "name": "Rip it",
        "artist": "Xtrullor",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 7116121,
    "position": 47,
    "name": "Problematic",
    "difficulty": "Easy",
    "rating": 3.13,
    "publisher": "Dhafin",
    "creators": [
      "Dhafin"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=pZlQMTCgY6E",
    "thumbnailUrl": "https://i.ytimg.com/vi/pZlQMTCgY6E/maxresdefault.jpg",
    "levelId": 7116121,
    "description": "Inspired by Nine Circles and Fairydust. A fun DEMON stage! Pass on my channel!",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "2.0",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "477060",
        "name": "~NK~ Problematic",
        "artist": "Rukkus",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 2,
    "position": 48,
    "name": "Theory of Everything 2",
    "difficulty": "Official",
    "rating": 3.05,
    "publisher": "RobTop",
    "creators": [
      "RobTop"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=1YI4oUUiV80",
    "thumbnailUrl": "https://i.ytimg.com/vi/1YI4oUUiV80/maxresdefault.jpg",
    "levelId": 2,
    "description": null,
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      },
      {
        "player": "Jack",
        "progress": 100,
        "nationality": "US",
        "subdivision": "CA"
      }
    ],
    "aredlPosition": null
  },
  {
    "id": 90475473,
    "position": 49,
    "name": "Change of Scene",
    "difficulty": "Easy",
    "rating": 3.04,
    "publisher": "bli",
    "creators": [
      "bli"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=FK4CpIYT1Z4",
    "thumbnailUrl": "https://i.ytimg.com/vi/FK4CpIYT1Z4/maxresdefault.jpg",
    "levelId": 90475473,
    "description": "Discord Gauntlet Contest entry, enjoy. You can find the full showcase with all coins on my yt channel. (2/2024 updated to fix various bugs related to 2.2)",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "1167964",
        "name": "Beethoven - Moonlight Sonata 3rd Movement (meganeko Remix) [2022 version]",
        "artist": "meganeko",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 77292103,
    "position": 50,
    "name": "White Space",
    "difficulty": "Easy",
    "rating": 2.89,
    "publisher": "Xender Game",
    "creators": [
      "Xender Game"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=cudGdxMDWBI",
    "thumbnailUrl": "https://i.ytimg.com/vi/cudGdxMDWBI/maxresdefault.jpg",
    "levelId": 77292103,
    "description": "Memories and Reality, are only ONE space, in between...",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "951493",
        "name": "Something Different (feat. Talurre)",
        "artist": "DerpCatOfficial",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 14850167,
    "position": 51,
    "name": "Horizon",
    "difficulty": "Easy",
    "rating": 2.89,
    "publisher": "Mylon",
    "creators": [
      "Mylon"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=V3nqPzwHOPU",
    "thumbnailUrl": "https://i.ytimg.com/vi/V3nqPzwHOPU/maxresdefault.jpg",
    "levelId": 14850167,
    "description": "...",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "2.0",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "576166",
        "name": "This Game RmX Off Vocal",
        "artist": "dj-Jo",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 14000484,
    "position": 52,
    "name": "Retro Circles",
    "difficulty": "Easy",
    "rating": 2.89,
    "publisher": "Nacho21",
    "creators": [
      "Nacho21"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=yVxKTQPzyus",
    "thumbnailUrl": "https://i.ytimg.com/vi/yVxKTQPzyus/maxresdefault.jpg",
    "levelId": 14000484,
    "description": "\"Nine Circles\" retro. Mi primera joya en mi carrera. Practica bien el nivel y buena suerte.",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 44824,
      "gameVersion": "2.2",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "649039",
        "name": "NK - Nine Circles (Xtrullor Remix)",
        "artist": "Xtrullor",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 9864147,
    "position": 53,
    "name": "Space Circles",
    "difficulty": "Easy",
    "rating": 2.89,
    "publisher": "SUOMI",
    "creators": [
      "SUOMI"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=SSeNcY2s_ug",
    "thumbnailUrl": "https://i.ytimg.com/vi/SSeNcY2s_ug/maxresdefault.jpg",
    "levelId": 9864147,
    "description": "Updated Version - Video & Password on My YouTube channel:   Geometry Dash Suomi",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "2.0",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "322053",
        "name": "~NK~ Spaceman",
        "artist": "Rukkus",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 1,
    "position": 54,
    "name": "Clubstep",
    "difficulty": "Official",
    "rating": 2.83,
    "publisher": "RobTop",
    "creators": [
      "RobTop"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=gok5ShDXxg4",
    "thumbnailUrl": "https://i.ytimg.com/vi/gok5ShDXxg4/maxresdefault.jpg",
    "levelId": 1,
    "description": null,
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      },
      {
        "player": "Jack",
        "progress": 100,
        "nationality": "US",
        "subdivision": "CA"
      }
    ],
    "aredlPosition": null
  },
  {
    "id": 184880,
    "position": 55,
    "name": "Ruined Planet",
    "difficulty": "Easy",
    "rating": 2.77,
    "publisher": "Ene",
    "creators": [
      "Ene"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=b0R2QrkSLTU",
    "thumbnailUrl": "https://i.ytimg.com/vi/b0R2QrkSLTU/maxresdefault.jpg",
    "levelId": 184880,
    "description": "Come to GW cafe!!",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 4833,
      "gameVersion": "2.2",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "Level 8",
        "name": "Time Machine",
        "artist": "Waterflame"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 82804029,
    "position": 56,
    "name": "Endless Descent",
    "difficulty": "Easy",
    "rating": 2.68,
    "publisher": "Ph4lip",
    "creators": [
      "Ph4lip"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=GD7qnGoFm4w",
    "thumbnailUrl": "https://i.ytimg.com/vi/GD7qnGoFm4w/maxresdefault.jpg",
    "levelId": 82804029,
    "description": "To the far reaches of the Abyss you descend, knowing you will never return. Based on the anime Made In Abyss. Uses Nong [Endless Embrace - Myth & Roid]",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 31233,
      "gameVersion": "2.2",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "1151112",
        "name": "Endless Embrace Remake",
        "artist": "flaaroni",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 1347537,
    "position": 57,
    "name": "invisible clubstep",
    "difficulty": "Easy",
    "rating": 2.61,
    "publisher": "J4cKy",
    "creators": [
      "J4cKy"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=9UDKGs6-FQ8",
    "thumbnailUrl": "https://i.ytimg.com/vi/9UDKGs6-FQ8/maxresdefault.jpg",
    "levelId": 1347537,
    "description": "SORRY THERE WAS A 48 PROCENT BUG NOW IS FIXED",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "1.7",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "Level 14",
        "name": "Clubstep",
        "artist": "DJ-Nate"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 49901047,
    "position": 58,
    "name": "End Line",
    "difficulty": "Easy",
    "rating": 1.99,
    "publisher": "dongchi",
    "creators": [
      "dongchi"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=HakhgDYYnk0",
    "thumbnailUrl": "https://i.ytimg.com/vi/HakhgDYYnk0/hqdefault.jpg",
    "levelId": 49901047,
    "description": "My first 2.1 map! I don't wanna get featured. I just want to make maps what I want!(like this...) Password is 026000!(Fixed 144hz bug)",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 26000,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "595087",
        "name": "End of the World",
        "artist": "Tagiito",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 13037894,
    "position": 59,
    "name": "infinite circles",
    "difficulty": "Easy",
    "rating": 1.97,
    "publisher": "startor",
    "creators": [
      "startor"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=xsiaAAqryKY",
    "thumbnailUrl": "https://i.ytimg.com/vi/xsiaAAqryKY/maxresdefault.jpg",
    "levelId": 13037894,
    "description": "8)",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 10648,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "621144",
        "name": "TheFatRat - Infinite Power",
        "artist": "ThisIsTheFatRat",
        "link": "http://audio.ngfiles.com/621000/621144_TheFatRat---Infinite-Power.mp3"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 57012656,
    "position": 60,
    "name": "Ship",
    "difficulty": "Easy",
    "rating": 1.91,
    "publisher": "SerpTop",
    "creators": [
      "SerpTop"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=9k7_DTIE9x4",
    "thumbnailUrl": "https://i.ytimg.com/vi/9k7_DTIE9x4/hqdefault.jpg",
    "levelId": 57012656,
    "description": "An ultracollab featuring over 80 participants with over 90k objects . Big thanks to MarkyDash for helping me host. Pass is 020200, enjoy!",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "695247",
        "name": "Asau",
        "artist": "1f1n1ty",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 89886591,
    "position": 61,
    "name": "iSpyWithMyLittleEye",
    "difficulty": "Easy",
    "rating": 1.87,
    "publisher": "Voxicat",
    "creators": [
      "Voxicat"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=Ow7nDnZTbDw",
    "thumbnailUrl": "https://i.ytimg.com/vi/Ow7nDnZTbDw/maxresdefault.jpg",
    "levelId": 89886591,
    "description": "You feel an evil presence watching you...",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 42043,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "1191782",
        "name": "BIKE",
        "artist": "tangermusic",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 28352064,
    "position": 62,
    "name": "The Farewell",
    "difficulty": "Easy",
    "rating": 1.79,
    "publisher": "JonathanGD",
    "creators": [
      "JonathanGD"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=5UGP2gAbaXk",
    "thumbnailUrl": "https://i.ytimg.com/vi/5UGP2gAbaXk/maxresdefault.jpg",
    "levelId": 28352064,
    "description": "This level was made to say goodbye to Update 2.0 in Geometry Dash. 2.0 was an awesome update! I loved it! It brings so many possibilities...",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "715772",
        "name": "Infinite Dungeon 1 & 2 (1f1n1ty Remix)",
        "artist": "1f1n1ty",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 76582313,
    "position": 63,
    "name": "The Long Walk Home",
    "difficulty": "Easy",
    "rating": 1.72,
    "publisher": "Renn241",
    "creators": [
      "Renn241"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=jPhwXXj4QQw",
    "thumbnailUrl": "https://i.ytimg.com/vi/jPhwXXj4QQw/maxresdefault.jpg",
    "levelId": 76582313,
    "description": "11m 20s solo demon... It was quite the journey building this. Verified by DrCuber",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "objects": 65535,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "696770",
        "name": "Night walk extended",
        "artist": "Cursedsnake",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 848722,
    "position": 64,
    "name": "Lights And Thunder",
    "difficulty": "Easy",
    "rating": 1.62,
    "publisher": "Lyod",
    "creators": [
      "Lyod"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=Ru4Ut2IXSqE",
    "thumbnailUrl": "https://i.ytimg.com/vi/Ru4Ut2IXSqE/maxresdefault.jpg",
    "levelId": 848722,
    "description": "First on 1.7! Remixes free and open! Good Luck and Have Fun!",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "1.7",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "Level 15",
        "name": "Electrodynamix",
        "artist": "DJ-Nate"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 80790301,
    "position": 65,
    "name": "Permafrost Mountain",
    "difficulty": "Easy",
    "rating": 1.59,
    "publisher": "5ta1ker",
    "creators": [
      "5ta1ker"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=PHgpHbhG37w",
    "thumbnailUrl": "https://i.ytimg.com/vi/PHgpHbhG37w/hqdefault.jpg",
    "levelId": 80790301,
    "description": "Mountains hide many secrets...                     but do you dare to find them all...",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "822787",
        "name": "Faux Tales - Beacon",
        "artist": "TheArcadium",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 127078077,
    "position": 66,
    "name": "Volcano",
    "difficulty": "Easy",
    "rating": 1.24,
    "publisher": "seannnn",
    "creators": [
      "seannnn"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=T1KaQ-WQRVo",
    "thumbnailUrl": "https://i.ytimg.com/vi/T1KaQ-WQRVo/maxresdefault.jpg",
    "levelId": 127078077,
    "description": "ts hot // best level, rate 10* easy demon",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 31778,
      "gameVersion": "2.2",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "865054",
        "name": "Solace (The Alpha Axiom EP)",
        "artist": "KaixoMusic",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 56587109,
    "position": 67,
    "name": "phjork",
    "difficulty": "Easy",
    "rating": 1.2,
    "publisher": "cerufiffy",
    "creators": [
      "cerufiffy"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=WocTNHlbf6g",
    "thumbnailUrl": "https://i.ytimg.com/vi/WocTNHlbf6g/maxresdefault.jpg",
    "levelId": 56587109,
    "description": "hope u liked the free demon <3 [final update]",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      },
      {
        "player": "Jack",
        "progress": 100,
        "nationality": "US",
        "subdivision": "CA"
      }
    ],
    "gd": {
      "length": "Medium",
      "objects": 50905,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "482542",
        "name": "Cosmic Dolphin",
        "artist": "megawolf77",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 128665322,
    "position": 68,
    "name": "red alert",
    "difficulty": "Easy",
    "rating": 1.18,
    "publisher": "ratliffigd",
    "creators": [
      "ratliffigd"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=yY9KoENQpbs",
    "thumbnailUrl": "https://i.ytimg.com/vi/yY9KoENQpbs/maxresdefault.jpg",
    "levelId": 128665322,
    "description": "2.0 styled level for destriv's cc",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 15034,
      "gameVersion": "2.2",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "510853",
        "name": "Dr. Phonics - Code Red",
        "artist": "DrPhonics",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 56210242,
    "position": 69,
    "name": "Shiver",
    "difficulty": "Easy",
    "rating": 1.17,
    "publisher": "SpKale",
    "creators": [
      "SpKale"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=KOm4M8ic8nk",
    "thumbnailUrl": "https://i.ytimg.com/vi/KOm4M8ic8nk/maxresdefault.jpg",
    "levelId": 56210242,
    "description": "he will NEVER cold.",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 46505,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "366026",
        "name": "KgZ- Black Snow (Violin Lead)",
        "artist": "KgZ",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 5904109,
    "position": 70,
    "name": "Platinum Adventure",
    "difficulty": "Easy",
    "rating": 1.13,
    "publisher": "Jerry4",
    "creators": [
      "Jerry4"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=DWGGjNnU5CA",
    "thumbnailUrl": "https://i.ytimg.com/vi/DWGGjNnU5CA/maxresdefault.jpg",
    "levelId": 5904109,
    "description": "pls no harder rub",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 11100,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "587069",
        "name": "-Endgame-",
        "artist": "Waterflame",
        "link": "http://audio.ngfiles.com/587000/587069_-Endgame-.mp3"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 566659,
    "position": 71,
    "name": "demon mixed",
    "difficulty": "Easy",
    "rating": 1.11,
    "publisher": "RealOggY",
    "creators": [
      "RealOggY"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=VVh_HkR17kk",
    "thumbnailUrl": "https://i.ytimg.com/vi/VVh_HkR17kk/maxresdefault.jpg",
    "levelId": 566659,
    "description": "i mixed some demon maps",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "Pre-1.7",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "Level 8",
        "name": "Time Machine",
        "artist": "Waterflame"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 126762295,
    "position": 72,
    "name": "SCORIGAMI",
    "difficulty": "Easy",
    "rating": 1.08,
    "publisher": "TornadoMan616",
    "creators": [
      "TornadoMan616"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=SNTd0uQeS-g",
    "thumbnailUrl": "https://i.ytimg.com/vi/SNTd0uQeS-g/maxresdefault.jpg",
    "levelId": 126762295,
    "description": "1 day level made as a result of a bet we made in regards to the newest NFL scorigami game | 40-40 final score - Dallas Cowboys vs. Green Bay Packers - 9/28/25",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "XL",
      "gameVersion": "2.2",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "550054",
        "name": "-Swirl!-",
        "artist": "Waterflame",
        "link": "http://audio.ngfiles.com/550000/550054_-Swirl-.mp3"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 55520,
    "position": 73,
    "name": "THE LIGHTNING ROAD",
    "difficulty": "Easy",
    "rating": 1.05,
    "publisher": "timeless real",
    "creators": [
      "timeless real"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=6403P2-763E",
    "thumbnailUrl": "https://i.ytimg.com/vi/6403P2-763E/maxresdefault.jpg",
    "levelId": 55520,
    "description": "Removed Coins, ~ Timeless Real / Reduloc",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 3527,
      "gameVersion": "2.1",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "Level 4",
        "name": "Dry Out",
        "artist": "DJVI"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 88494611,
    "position": 74,
    "name": "Eternal",
    "difficulty": "Easy",
    "rating": 1.04,
    "publisher": "YunHaSeu14",
    "creators": [
      "YunHaSeu14"
    ],
    "verifier": "jd",
    "videoUrl": "https://www.youtube.com/watch?v=Rqg12KDopUo",
    "thumbnailUrl": "https://i.ytimg.com/vi/Rqg12KDopUo/maxresdefault.jpg",
    "levelId": 88494611,
    "description": "Eternal happiness...  :)",
    "requirementPercent": 100,
    "records": [
      {
        "player": "jd",
        "progress": 100,
        "nationality": "US",
        "subdivision": null
      }
    ],
    "gd": {
      "length": "Long",
      "objects": 65535,
      "gameVersion": "2.2",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "1068034",
        "name": "eternal",
        "artist": "korewakosu",
        "link": "-"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  },
  {
    "id": 13519,
    "position": 75,
    "name": "The Nightmare",
    "difficulty": "Easy",
    "rating": 1.04,
    "publisher": "Jax",
    "creators": [
      "Jax"
    ],
    "verifier": "Nigel",
    "videoUrl": "https://www.youtube.com/watch?v=Xl4stg-bsxk",
    "thumbnailUrl": "https://i.ytimg.com/vi/Xl4stg-bsxk/maxresdefault.jpg",
    "levelId": 13519,
    "description": "Hard map by Jax. 7813",
    "requirementPercent": 100,
    "records": [
      {
        "player": "Nigel",
        "progress": 100,
        "nationality": "US",
        "subdivision": "IL"
      }
    ],
    "gd": {
      "length": "Long",
      "gameVersion": "1.7",
      "inGameDifficulty": "Easy Demon",
      "song": {
        "id": "Level 3",
        "name": "Polargeist",
        "artist": "Step"
      },
      "songOfficial": false
    },
    "aredlPosition": null
  }
];
