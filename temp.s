  # Check left
  and $2, $1, BUTTON_LEFT
  equ $2, $0
  brf @_update_snake_l

  # Check down
  and $2, $1, BUTTON_DOWN
  equ $2, $0
  brf @_update_snake_d

  # Check up
  and $2, $1, BUTTON_UP
  equ $2, $0
  brf @_update_snake_u

  # Check right
  and $2, $1, BUTTON_RIGHT
  equ $2, $0
  brf @_update_snake_r

  jmp @_update_snake_move

  @_update_snake_l
    and $3, SNAKE_VALID_HORZ # AND with valid directions
    brt @_update_snake_move  # Branch if zero (not valid)
    mov $3, BUTTON_LEFT
    jmp @_update_snake_move
  @_update_snake_d
    and $3, SNAKE_VALID_VERT # AND with valid directions
    brt @_update_snake_move  # Branch if zero (not valid)

    jmp @_update_snake_move
  @_update_snake_u
    and $3, SNAKE_VALID_VERT # AND with valid directions
    brt @_update_snake_move  # Branch if zero (not valid)

    jmp @_update_snake_move
  @_update_snake_r
    and $3, SNAKE_VALID_HORZ # AND with valid directions
    brt @_update_snake_move  # Branch if zero (not valid)

  @_update_snake_move
  ret
