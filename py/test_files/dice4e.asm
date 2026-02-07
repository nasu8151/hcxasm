np
start:
li #0
sa r0
read:
ld r14
li #15
ad r7
li #read:1
li #read:0
jp nc
ld r0
li #1
ad r0
ad r15
ld r0
li #10
ad r7
li #read:1
li #read:0
jp nc
li #start:1
li #start:0
jp