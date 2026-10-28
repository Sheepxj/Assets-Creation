package com.sheepxj.assets.security;

import com.sheepxj.assets.contract.ApiContracts.UserDto;
import java.io.Serializable;

/** The session principal contains no password, hash or client-supplied identity. */
public record UserIdentity(String id, String username) implements Serializable {
    private static final long serialVersionUID = 1L;
    public UserDto toDto() { return new UserDto(id, username); }
}
