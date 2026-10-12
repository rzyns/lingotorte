"""Finite real-browser inventory, adapted unchanged from the reviewed live-v2 kit."""
PHASES=('A24-dev-settings-save','A24-dev-native-audio','A25-foreign-null','A26-allowed-denials','A26-restart-poll-autosave','A27-endpoint-redirect','A28-reload-storage','A24-LAN-built-settings-save-audio')
ROUTES=[('GET','/api/status','private-read'),('GET','/api/state','private-read'),('GET','/api/jobs/{waitingId}','private-read'),('GET','/api/snippets/{snippetId}','private-read-LRU'),('PUT','/api/state','durable-save'),('POST','/api/jobs/{waitingId}/cancel','cancel'),('DELETE','/api/snippets/{snippetId}','delete'),('POST','/api/artifacts/cleanup','cleanup')]+[('POST','/api/jobs',k) for k in ('waiting','noop','local-transcription','elevenlabs-scribe','youtube-caption','embedded-subtitle-list','embedded-subtitle-extract','source-audio-snippet')]
def inventory():
 rows=[]
 for fault in ('foreign','null','missing','wrong'):
  for index,(method,path,effect) in enumerate(ROUTES):
   rows.append(dict(id=f'{fault}-fetch-{index}',phase='A25-foreign-null' if fault in ('foreign','null') else 'A26-allowed-denials',fault=fault,channel='fetch',method=method,path=path,effect=effect,expectedStatus=403 if fault in ('foreign','null') else 401))
 for fault in ('foreign','null'):
  for index,(method,path,effect) in enumerate(ROUTES):
   channels=['form'] if method=='POST' else ['navigation','embed'] if method=='GET' else []
   for channel in channels:rows.append(dict(id=f'{fault}-{channel}-{index}',phase='A25-foreign-null',fault=fault,channel=channel,method=method,path=path,effect=effect,**({'expectedStatus':403} if channel=='form' else {'expectedStatusFromObservedEnvelope':{'originAbsent':401,'foreignOrNullOrigin':403}})))
 controls={PHASES[0]:['masked-pair','nonempty-import','durable-ack'],PHASES[1]:['native-policy','job-poll','wav-get-delete-blob','media-ready','play-or-policy-block'],PHASES[2]:['job-control-'+k for k in ('waiting','noop','local-transcription','elevenlabs-scribe','youtube-caption','embedded-subtitle-list','embedded-subtitle-extract','source-audio-snippet')]+['paused-denial-release'],PHASES[4]:['both-pending','restart-new-capability','preserved-no-replay','stale-accepted-ack','explicit-repair'],PHASES[5]:['endpoint-edit','redirect-denied','hostile-result-path'],PHASES[6]:['reload-fresh-pair','disconnect','storage-export-url-absence'],PHASES[7]:['built-asset-binding','masked-pair','subtle-absent-nonempty-import','durable-ack','wav-get-delete-blob','media-ready','play-or-policy-block']}
 for phase,names in controls.items():
  for name in names:rows.append(dict(id=phase+':'+name,phase=phase,channel='control',stage=name))
 return rows
