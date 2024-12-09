# redis-recreation

1. Change sh script permission

```bash
chmod +x ./redis.sh
```

2. run to start redis server

3. testing with netcat - example of redis RESP procol (human readable form being) ['ECHO', 'hey']

```bash
(printf '*2\r\n$4\r\nECHO\r\n$3\r\nhey\r\n';) | nc localhost 6379
```


