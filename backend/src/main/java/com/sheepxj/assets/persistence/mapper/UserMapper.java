package com.sheepxj.assets.persistence.mapper;

import com.sheepxj.assets.persistence.model.UserRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserMapper {
    UserRecord findById(@Param("id") String id);
    UserRecord findByUsername(@Param("username") String username);
    int insert(UserRecord user);
}
