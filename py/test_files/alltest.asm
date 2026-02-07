; All Instructions Test File

start: ;inline comment
    sm
    sc r0
    su r0
    ad r0
    xr r0
    or r0
    an r0
    sa r0
    lm
    ld r0
    li #0b0
    jp
    np
    li #forward:2
    li #forward:1
    li #forward:0
    jp
    li #start:2
    li #start:1
    li #start:0
    jp
forward:
    li #0x0
    sa r0
    jp